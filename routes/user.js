const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { isAuthenticated } = require('../middleware/auth');

router.get('/profile', isAuthenticated, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId);
    res.render('profile', { user });
  } catch (error) {
    console.error('Error loading profile:', error);
    res.redirect('/dashboard');
  }
});

router.post('/timezone', isAuthenticated, async (req, res) => {
  try {
    const { timezone } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { timezone },
      { new: true }
    );

    // Generate new JWT with updated timezone
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        name: user.name,
        timezone: user.timezone || 'UTC'
      },
      process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '1d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.send(`
      <div class="text-green-600 text-sm">Timezone updated successfully!</div>
      <script>setTimeout(() => location.reload(), 1000);</script>
    `);
  } catch (error) {
    console.error('Error updating timezone:', error);
    res.status(500).send(`
      <div class="text-red-600 text-sm">Failed to update timezone</div>
    `);
  }
});

router.post('/profile', isAuthenticated, async (req, res) => {
  try {
    const { name, email } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.userId,
      { name: name?.trim(), email: email?.trim().toLowerCase() },
      { new: true, runValidators: true }
    );

    if (!user) {
      return res.status(404).send(`
        <div class="text-red-600 text-sm">User not found.</div>
      `);
    }

    // Refresh JWT so dashboard welcome message updates immediately
    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        name: user.name,
        timezone: user.timezone || 'UTC'
      },
      process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
      { expiresIn: '1d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.COOKIE_SECURE === 'true',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000
    });

    res.send(`
      <div class="text-green-600 text-sm">Profile updated successfully!</div>
    `);
  } catch (error) {
    console.error('Error updating profile:', error);

    if (error.code === 11000) {
      return res.status(400).send(`
        <div class="text-red-600 text-sm">Email is already in use. Please choose another.</div>
      `);
    }

    res.status(500).send(`
      <div class="text-red-600 text-sm">Failed to update profile</div>
    `);
  }
});

router.post('/password', isAuthenticated, async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).send(`
        <div class="text-red-600 text-sm">All password fields are required.</div>
      `);
    }

    if (newPassword.length < 6) {
      return res.status(400).send(`
        <div class="text-red-600 text-sm">New password must be at least 6 characters.</div>
      `);
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).send(`
        <div class="text-red-600 text-sm">New password and confirmation do not match.</div>
      `);
    }

    const user = await User.findById(req.user.userId);
    if (!user) {
      return res.status(404).send(`
        <div class="text-red-600 text-sm">User not found.</div>
      `);
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).send(`
        <div class="text-red-600 text-sm">Current password is incorrect.</div>
      `);
    }

    if (await user.comparePassword(newPassword)) {
      return res.status(400).send(`
        <div class="text-red-600 text-sm">New password cannot be the same as current password.</div>
      `);
    }

    user.password = newPassword;
    await user.save();

    res.clearCookie('token');
    res.send(`
      <div class="text-green-600 text-sm">Password changed successfully! Redirecting to login...</div>
      <script>setTimeout(() => { window.location.href = '/login'; }, 1500);</script>
    `);
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).send(`
      <div class="text-red-600 text-sm">Failed to change password</div>
    `);
  }
});

router.post('/delete', isAuthenticated, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.user.userId);
    res.clearCookie('token');
    res.send(`
      <div class="text-green-600 text-sm">Account deleted successfully</div>
      <script>setTimeout(() => location.href = '/register', 1000);</script>
    `);
  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).send(`
      <div class="text-red-600 text-sm">Failed to delete account</div>
    `);
  }
});

module.exports = router;
