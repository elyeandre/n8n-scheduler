const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  webhookUrl: {
    type: String,
    required: true
  },
  httpMethod: {
    type: String,
    enum: ['GET', 'POST', 'PUT', 'DELETE'],
    default: 'POST'
  },
  jsonBody: {
    type: String,
    default: '{}'
  },
  authType: {
    type: String,
    enum: ['none', 'bearer', 'apikey', 'basic'],
    default: 'none'
  },
  authToken: {
    type: String,
    default: null
  },
  authApiKeyName: {
    type: String,
    default: null
  },
  authApiKeyValue: {
    type: String,
    default: null
  },
  authUsername: {
    type: String,
    default: null
  },
  authPassword: {
    type: String,
    default: null
  },
  customHeaders: {
    type: String, // JSON string of key-value pairs
    default: '{}'
  },
  scheduleAt: {
    type: Date,
    required: true
  },
  cronExpression: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['Pending', 'Executed', 'Failed', 'Cancelled'],
    default: 'Pending'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  frequency: {
    type: String,
    enum: ['once', 'seconds', 'minutes', 'hours', 'days', 'weeks', 'months', 'years'],
    default: 'once'
  },
  interval: {
    type: Number,
    default: 1,
    min: 1
  },
  isRecurring: {
    type: Boolean,
    default: false
  },
  useSpecificTime: {
    type: Boolean,
    default: false
  },
  specificHour: {
    type: Number,
    min: 0,
    max: 23,
    default: null
  },
  specificMinute: {
    type: Number,
    min: 0,
    max: 59,
    default: null
  },
  daysOfWeek: {
    type: [Number], // 0-6 (Sunday-Saturday)
    default: []
  },
  dayOfMonth: {
    type: Number,
    min: 1,
    max: 31,
    default: null
  },
  lastExecuted: {
    type: Date,
    default: null
  },
  nextExecution: {
    type: Date,
    default: null
  },
  executionCount: {
    type: Number,
    default: 0
  },
  timezone: {
    type: String,
    default: 'UTC'
  },
  timeout: {
    type: Number,
    default: 30000, // 30 seconds default
    min: 1000, // Minimum 1 second
    max: 600000 // Maximum 10 minutes (600 seconds) for long-running workflows
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Schedule', scheduleSchema);
