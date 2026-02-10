const mongoose = require('mongoose');

const executionLogSchema = new mongoose.Schema({
  scheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Schedule',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  scheduleName: {
    type: String,
    required: true
  },
  webhookUrl: {
    type: String,
    required: true
  },
  httpMethod: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Success', 'Failed'],
    required: true
  },
  responseStatus: {
    type: Number,
    default: null
  },
  responseData: {
    type: String,
    default: null
  },
  errorMessage: {
    type: String,
    default: null
  },
  executionTime: {
    type: Number, // in milliseconds
    default: null
  },
  triggeredBy: {
    type: String,
    enum: ['Cron', 'Manual'],
    default: 'Cron'
  },
  executedAt: {
    type: Date,
    default: Date.now
  }
});

executionLogSchema.index({ userId: 1, executedAt: -1 });
executionLogSchema.index({ scheduleId: 1, executedAt: -1 });

module.exports = mongoose.model('ExecutionLog', executionLogSchema);
