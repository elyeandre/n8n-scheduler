const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { 
  isValidEmail, 
  isValidPassword, 
  isValidName,
  sanitizeHTML 
} = require('../utils/validation');

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, timezone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).send(`
        <div class="text-red-600 text-sm font-medium p-3 bg-red-50 rounded-lg border border-red-200">
          All fields are required
        </div>
      `);
    }

    const nameValidation = isValidName(name);
    if (!nameValidation.valid) {
      return res.status(400).send(`
        <div class="text-red-600 text-sm font-medium p-3 bg-red-50 rounded-lg border border-red-200">
          ${sanitizeHTML(nameValidation.message)}
        </div>
      `);
    }

    if (!isValidEmail(email)) {
      return res.status(400).send(`
        <div class="text-red-600 text-sm font-medium p-3 bg-red-50 rounded-lg border border-red-200">
          Please enter a valid email address
        </div>
      `);
    }

    const passwordValidation = isValidPassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).send(`
        <div class="text-red-600 text-sm font-medium p-3 bg-red-50 rounded-lg border border-red-200">
          ${sanitizeHTML(passwordValidation.message)}
        </div>
      `);
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).send(`
        <div class="text-red-600 text-sm font-medium p-3 bg-red-50 rounded-lg border border-red-200">
          Email already registered
        </div>
      `);
    }

    const user = new User({ 
      name: name.trim(), 
      email: email.toLowerCase().trim(), 
      password, 
      timezone: timezone || 'UTC' 
    });
    await user.save();

    console.log(`[OK] New user registered: ${user.email}`);

    res.send(`
      <div class="text-green-600 text-sm font-medium p-3 bg-green-50 rounded-lg border border-green-200">
        Registration successful! Redirecting to login...
      </div>
      <script>setTimeout(() => window.location.href = '/login', 1500);</script>
    `);
  } catch (error) {
    console.error('Registration error:', error);
    
    let errorMessage = 'Registration failed. Please try again.';
    if (error.code === 11000) {
      errorMessage = 'Email already registered';
    } else if (error.name === 'ValidationError') {
      errorMessage = Object.values(error.errors).map(e => e.message).join(', ');
    } else if (error.message && process.env.NODE_ENV !== 'production') {
      errorMessage = error.message;
    }
    
    res.status(500).send(`
      <div class="text-red-600 text-sm font-medium p-3 bg-red-50 rounded-lg border border-red-200">
        ${sanitizeHTML(errorMessage)}
      </div>
    `);
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return res.status(400).send(`
        <div class="text-red-600 text-sm font-medium p-3 bg-red-50 rounded-lg border border-red-200">
          Email and password are required
        </div>
      `);
    }

    if (!isValidEmail(email)) {
      return res.status(400).send(`
        <div class="text-red-600 text-sm font-medium p-3 bg-red-50 rounded-lg border border-red-200">
          Please enter a valid email address
        </div>
      `);
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).send(`
        <div class="text-red-600 text-sm font-medium p-3 bg-red-50 rounded-lg border border-red-200">
          Invalid email or password
        </div>
      `);
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).send(`
        <div class="text-red-600 text-sm font-medium p-3 bg-red-50 rounded-lg border border-red-200">
          Invalid email or password
        </div>
      `);
    }

    const jwtSecret = process.env.SESSION_SECRET;
    if (!jwtSecret || jwtSecret === 'your-secret-key-change-in-production') {
      console.error('[ERROR] JWT secret not properly configured');
      return res.status(500).send(`
        <div class="text-red-600 text-sm font-medium p-3 bg-red-50 rounded-lg border border-red-200">
          Server configuration error. Please contact administrator.
        </div>
      `);
    }

    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        name: user.name,
        timezone: user.timezone || 'UTC'
      },
      jwtSecret,
      { expiresIn: rememberMe === 'on' ? '30d' : '1d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      maxAge: rememberMe === 'on' ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
    });

    console.log(`[OK] User logged in: ${user.email}`);

    res.send(`
      <div class="text-green-600 text-sm font-medium p-3 bg-green-50 rounded-lg border border-green-200">
        Login successful! Redirecting...
      </div>
      <script>setTimeout(() => window.location.href = '/dashboard', 1000);</script>
    `);
  } catch (error) {
    console.error('Login error:', error);
    
    let errorMessage = 'Login failed. Please try again.';
    if (error.name === 'MongoNetworkError' || error.name === 'MongooseServerSelectionError') {
      errorMessage = 'Database connection error. Please try again later.';
    } else if (error.message && process.env.NODE_ENV !== 'production') {
      errorMessage = error.message;
    }
    
    res.status(500).send(`
      <div class="text-red-600 text-sm font-medium p-3 bg-red-50 rounded-lg border border-red-200">
        ${sanitizeHTML(errorMessage)}
      </div>
    `);
  }
});

module.exports = router;
