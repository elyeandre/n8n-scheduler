const axios = require('axios');
const Schedule = require('../models/Schedule');
const ExecutionLog = require('../models/ExecutionLog');

const activeCronJobs = new Map();
const activeTimeouts = new Map();

const MAX_RETRY_ATTEMPTS = 0;
const RETRY_DELAY_MS = 5000;
const DEFAULT_WEBHOOK_TIMEOUT_MS = 30000;
const MAX_TIMEOUT_MS = 2147483647; // ~24.8 days

async function executeWebhook(schedule, triggeredBy = 'Cron', retryCount = 0) {
  const startTime = Date.now();
  
  if (schedule.isActive === false) {
    console.log(`[SKIP] Schedule "${schedule.name}" is paused`);
    return { success: false, skipped: true };
  }
  
  try {
    console.log(`[EXEC] Schedule: ${schedule.name} (Attempt ${retryCount + 1}/${MAX_RETRY_ATTEMPTS})`);
    
    let body = {};
    try {
      body = JSON.parse(schedule.jsonBody || '{}');
    } catch (e) {
      console.warn(`[WARN] Invalid JSON body for schedule ${schedule.name}, using empty object`);
    }

    const config = {
      method: schedule.httpMethod.toLowerCase(),
      url: schedule.webhookUrl,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'n8n-scheduler/1.0'
      },
      timeout: schedule.timeout || DEFAULT_WEBHOOK_TIMEOUT_MS,
      validateStatus: (status) => status < 500
    };

    // Add authentication headers
    if (schedule.authType && schedule.authType !== 'none') {
      switch (schedule.authType) {
        case 'bearer':
          if (schedule.authToken) {
            config.headers['Authorization'] = `Bearer ${schedule.authToken}`;
            console.log(`[AUTH] Using Bearer token`);
          }
          break;
        
        case 'apikey':
          if (schedule.authApiKeyName && schedule.authApiKeyValue) {
            config.headers[schedule.authApiKeyName] = schedule.authApiKeyValue;
            console.log(`[AUTH] Using API Key (${schedule.authApiKeyName})`);
          }
          break;
        
        case 'basic':
          if (schedule.authUsername && schedule.authPassword) {
            const credentials = Buffer.from(`${schedule.authUsername}:${schedule.authPassword}`).toString('base64');
            config.headers['Authorization'] = `Basic ${credentials}`;
            console.log(`[AUTH] Using Basic authentication`);
          }
          break;
      }
    }

    if (schedule.customHeaders) {
      try {
        const customHeaders = JSON.parse(schedule.customHeaders);
        Object.entries(customHeaders).forEach(([key, value]) => {
          if (key && value) {
            config.headers[key] = value;
          }
        });
      } catch (e) {
        console.warn(`[WARN] Invalid custom headers JSON for schedule ${schedule.name}`);
      }
    }

    // Only add data for POST, PUT, PATCH
    if (['post', 'put', 'patch'].includes(config.method)) {
      config.data = body;
    }

    const response = await axios(config);
    const executionTime = Date.now() - startTime;

    const isSuccess = response.status >= 200 && response.status < 400;

    if (!isSuccess && retryCount < MAX_RETRY_ATTEMPTS - 1) {
      console.warn(`[WARN] Schedule ${schedule.name} returned status ${response.status}, retrying...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return await executeWebhook(schedule, triggeredBy, retryCount + 1);
    }

    // Update schedule status
    schedule.status = isSuccess ? 'Executed' : 'Failed';
    schedule.lastExecuted = new Date();
    schedule.executionCount = (schedule.executionCount || 0) + 1;
    
    if (schedule.frequency !== 'once') {
      schedule.nextExecution = calculateNextExecution(schedule);
    } else {
      schedule.nextExecution = null;
    }
    
    await schedule.save();

    console.log(`${isSuccess ? '[OK]' : '[WARN]'} Schedule executed: ${schedule.name} - Status: ${response.status}`);
    
    // Save execution log
    await ExecutionLog.create({
      scheduleId: schedule._id,
      userId: schedule.userId,
      scheduleName: schedule.name,
      webhookUrl: schedule.webhookUrl,
      httpMethod: schedule.httpMethod,
      status: isSuccess ? 'Success' : 'Failed',
      responseStatus: response.status,
      responseData: JSON.stringify(response.data).substring(0, 1000),
      executionTime: executionTime,
      triggeredBy: triggeredBy,
      executedAt: new Date()
    });
    
    // Emit real-time update via SSE
    if (global.broadcastToUser) {
      global.broadcastToUser(schedule.userId.toString(), {
        type: 'schedule-executed',
        scheduleId: schedule._id.toString(),
        status: schedule.status,
        lastExecuted: schedule.lastExecuted,
        executionCount: schedule.executionCount,
        nextExecution: schedule.nextExecution,
        frequency: schedule.frequency
      });
    }

    return { success: isSuccess, response };
  } catch (error) {
    console.error(`[ERROR] Executing schedule: ${schedule.name}`, error.message);
    
    const executionTime = Date.now() - startTime;
    
    if (retryCount < MAX_RETRY_ATTEMPTS - 1 && isRetryableError(error)) {
      console.warn(`[RETRY] Schedule ${schedule.name} after error...`);
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return await executeWebhook(schedule, triggeredBy, retryCount + 1);
    }
    
    schedule.status = 'Failed';
    schedule.lastExecuted = new Date();
    
    if (schedule.frequency !== 'once') {
      schedule.nextExecution = calculateNextExecution(schedule);
    } else {
      schedule.nextExecution = null;
    }
    
    await schedule.save();
    
    await ExecutionLog.create({
      scheduleId: schedule._id,
      userId: schedule.userId,
      scheduleName: schedule.name,
      webhookUrl: schedule.webhookUrl,
      httpMethod: schedule.httpMethod,
      status: 'Failed',
      responseStatus: error.response?.status || null,
      errorMessage: error.message,
      executionTime: executionTime,
      triggeredBy: triggeredBy,
      executedAt: new Date()
    });
    
    // Emit real-time update via SSE
    if (global.broadcastToUser) {
      global.broadcastToUser(schedule.userId.toString(), {
        type: 'schedule-updated',
        scheduleId: schedule._id.toString(),
        status: schedule.status,
        lastExecuted: schedule.lastExecuted,
        executionCount: schedule.executionCount,
        nextExecution: schedule.nextExecution
      });
    }

    return { success: false, error };
  }
}

function isRetryableError(error) {
  if (error.code === 'ECONNREFUSED' || 
      error.code === 'ETIMEDOUT' || 
      error.code === 'ENOTFOUND' ||
      error.code === 'ECONNRESET') {
    return true;
  }
  
  if (error.response && error.response.status >= 500) {
    return true;
  }
  
  return false;
}

function calculateNextExecution(schedule) {
  const scheduleDate = new Date(schedule.scheduleAt);
  const now = new Date();
  const interval = schedule.interval || 1;
  
  if (schedule.frequency === 'once') {
    if (schedule.lastExecuted || scheduleDate <= now) {
      return null;
    }
    return scheduleDate;
  }

  if (schedule.useSpecificTime && schedule.specificHour !== null && schedule.specificMinute !== null) {
    return calculateNextExecutionWithSpecificTime(schedule, now);
  }

  let next = new Date(scheduleDate);
  
  // Fast-forward to future
  const nowWithBuffer = new Date(now.getTime() + 1000);
  
  while (next <= nowWithBuffer) {
    switch (schedule.frequency) {
      case 'seconds':
        next.setSeconds(next.getSeconds() + interval);
        break;
      case 'minutes':
        next.setMinutes(next.getMinutes() + interval);
        break;
      case 'hours':
        next.setHours(next.getHours() + interval);
        break;
      case 'days':
        next.setDate(next.getDate() + interval);
        break;
      case 'weeks':
        next.setDate(next.getDate() + (7 * interval));
        break;
      case 'months':
        next.setMonth(next.getMonth() + interval);
        break;
      case 'years':
        next.setFullYear(next.getFullYear() + interval);
        break;
    }
  }
  
  return next;
}

function calculateNextExecutionWithSpecificTime(schedule, now) {
  const nowWithBuffer = new Date(now.getTime() + 1000);
  let next = new Date(nowWithBuffer);
  
  next.setHours(schedule.specificHour);
  next.setMinutes(schedule.specificMinute);
  next.setSeconds(0);
  next.setMilliseconds(0);
  
  const interval = schedule.interval || 1;
  
  switch (schedule.frequency) {
    case 'hours':
      if (next <= nowWithBuffer) {
        next.setHours(next.getHours() + interval);
      }
      break;
    
    case 'days':
      if (next <= nowWithBuffer) {
        next.setDate(next.getDate() + interval);
      }
      break;
    
    case 'weeks':
      if (schedule.daysOfWeek && schedule.daysOfWeek.length > 0) {
        let found = false;
        let daysChecked = 0;
        const maxDaysToCheck = 7 * interval + 7;
        
        while (!found && daysChecked < maxDaysToCheck) {
          const dayOfWeek = next.getDay();
          
          if (schedule.daysOfWeek.includes(dayOfWeek) && next > nowWithBuffer) {
            found = true;
          } else {
            next.setDate(next.getDate() + 1);
            daysChecked++;
          }
        }
      } else {
        if (next <= nowWithBuffer) {
          next.setDate(next.getDate() + (7 * interval));
        }
      }
      break;
    
    case 'months':
      if (schedule.dayOfMonth) {
        next.setDate(schedule.dayOfMonth);
      }
      
      if (next <= nowWithBuffer) {
        next.setMonth(next.getMonth() + interval);
        if (schedule.dayOfMonth) {
          next.setDate(schedule.dayOfMonth);
        }
      }
      break;
    
    case 'years':
      if (schedule.dayOfMonth) {
        next.setDate(schedule.dayOfMonth);
      }
      
      if (next <= nowWithBuffer) {
        next.setFullYear(next.getFullYear() + interval);
        if (schedule.dayOfMonth) {
          next.setDate(schedule.dayOfMonth);
        }
      }
      break;
    
    default:
      return calculateNextExecution({ ...schedule, useSpecificTime: false });
  }
  
  return next;
}

function scheduleCronJob(schedule) {
  const scheduleId = schedule._id.toString();
  const interval = schedule.interval || 1;
  
  if (schedule.isActive === false) {
    cancelCronJob(scheduleId);
    console.log(`[SKIP] Schedule "${schedule.name}" is paused. Not scheduling.`);
    return;
  }
  
  cancelCronJob(scheduleId);

  const now = new Date();
  const nextExec = calculateNextExecution(schedule);

  if (!nextExec) {
    console.log(`[SKIP] Schedule "${schedule.name}" is in the past or completed`);
    return;
  }

  const delay = nextExec.getTime() - now.getTime();
  
  console.log(`[SCHEDULE] "${schedule.name}" for ${nextExec.toLocaleString()} (in ${Math.round(delay/1000)}s)`);

  // Immediate or very short delays
  if (delay <= 0) {
    console.log(`[EXEC] Executing immediately: ${schedule.name}`);
    executeWebhook(schedule).then(() => {
      // For recurring schedules, reschedule after execution
      if (schedule.frequency !== 'once') {
        Schedule.findById(schedule._id).then(updatedSchedule => {
          if (updatedSchedule) {
            scheduleCronJob(updatedSchedule);
          }
        });
      }
    }).catch(err => console.error('Immediate execution error:', err));
    return;
  }

  // Delays less than MAX_TIMEOUT_MS (~24 days): use setTimeout for precise timing
  if (delay < MAX_TIMEOUT_MS) {
    const timeoutId = setTimeout(async () => {
      try {
        await executeWebhook(schedule);
        activeTimeouts.delete(scheduleId);
        activeCronJobs.delete(scheduleId);
        
        if (schedule.frequency !== 'once') {
          const updatedSchedule = await Schedule.findById(schedule._id);
          if (updatedSchedule) {
            scheduleCronJob(updatedSchedule);
          }
        }
      } catch (error) {
        console.error(`Error in setTimeout execution for ${schedule.name}:`, error);
      }
    }, delay);
    
    activeTimeouts.set(scheduleId, timeoutId);
    activeCronJobs.set(scheduleId, { 
      type: 'timeout', 
      clear: () => {
        clearTimeout(timeoutId);
        activeTimeouts.delete(scheduleId);
      }
    });
    
    schedule.nextExecution = nextExec;
    schedule.save().catch(err => console.error('Error updating next execution:', err));
    
    console.log(`[OK] Timer set for schedule: ${schedule.name} (${schedule.frequency})`);
    return;
  }

  // Very long delays (>24 days): use a daily check
  const checkDaily = async () => {
    const now = new Date();
    const timeUntilExec = nextExec.getTime() - now.getTime();
    
    if (timeUntilExec <= 0) {
      await executeWebhook(schedule);
      activeCronJobs.delete(scheduleId);
      activeTimeouts.delete(scheduleId);
      
      if (schedule.frequency !== 'once') {
        const updatedSchedule = await Schedule.findById(schedule._id);
        if (updatedSchedule) {
          scheduleCronJob(updatedSchedule);
        }
      }
    } else if (timeUntilExec < MAX_TIMEOUT_MS) {
      const updatedSchedule = await Schedule.findById(schedule._id);
      if (updatedSchedule) {
        scheduleCronJob(updatedSchedule);
      }
    } else {
      const timeoutId = setTimeout(checkDaily, 24 * 60 * 60 * 1000);
      activeTimeouts.set(scheduleId, timeoutId);
    }
  };
  
  const timeoutId = setTimeout(checkDaily, 24 * 60 * 60 * 1000);
  activeTimeouts.set(scheduleId, timeoutId);
  activeCronJobs.set(scheduleId, { 
    type: 'long-timeout', 
    clear: () => {
      clearTimeout(timeoutId);
      activeTimeouts.delete(scheduleId);
    }
  });
  
  // Update next execution in database
  schedule.nextExecution = nextExec;
  schedule.save().catch(err => console.error('Error updating next execution:', err));
  
  console.log(`[OK] Long-term timer set for schedule: ${schedule.name}`);
}

function cancelCronJob(scheduleId) {
  if (activeCronJobs.has(scheduleId)) {
    const job = activeCronJobs.get(scheduleId);
    try {
      if (job.stop) job.stop();
      if (job.clear) job.clear();
      activeCronJobs.delete(scheduleId);
      console.log(`[CANCEL] Job cancelled for schedule: ${scheduleId}`);
    } catch (error) {
      console.error(`Error cancelling job ${scheduleId}:`, error);
    }
  }
  
  if (activeTimeouts.has(scheduleId)) {
    const timeoutId = activeTimeouts.get(scheduleId);
    try {
      clearTimeout(timeoutId);
      activeTimeouts.delete(scheduleId);
      console.log(`[CANCEL] Timeout cancelled for schedule: ${scheduleId}`);
    } catch (error) {
      console.error(`Error cancelling timeout ${scheduleId}:`, error);
    }
  }
}

async function initializeCronJobs() {
  try {
    const schedules = await Schedule.find({ 
      status: { $in: ['Pending', 'Failed'] }
    });
    
    console.log(`[INIT] Initializing ${schedules.length} schedules...`);
    
    for (const schedule of schedules) {
      try {
        if (schedule.status === 'Failed') {
          schedule.status = 'Pending';
          await schedule.save();
        }
        scheduleCronJob(schedule);
      } catch (error) {
        console.error(`Error initializing schedule ${schedule.name}:`, error);
      }
    }
    
    console.log(`[OK] All schedules initialized (${activeCronJobs.size} active jobs)`);
  } catch (error) {
    console.error('[ERROR] Initializing cron jobs:', error);
  }
}

module.exports = {
  scheduleCronJob,
  cancelCronJob,
  initializeCronJobs,
  executeWebhook
};
