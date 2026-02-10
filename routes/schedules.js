const express = require('express');
const router = express.Router();
const Schedule = require('../models/Schedule');
const { scheduleCronJob, cancelCronJob, executeWebhook } = require('../utils/cronManager');
const { isAuthenticated } = require('../middleware/auth');
const { generateScheduleRow } = require('../utils/scheduleRowGenerator');

router.get('/', isAuthenticated, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const frequency = req.query.frequency || '';

    const query = { userId: req.user.userId };
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { webhookUrl: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) {
      query.status = status;
    }
    
    if (frequency) {
      query.frequency = frequency;
    }

    const totalSchedules = await Schedule.countDocuments(query);
    const schedules = await Schedule.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip);

    const totalPages = Math.ceil(totalSchedules / limit);
    
    let schedulesHtml = schedules.map(s => generateScheduleRow(s, {
      extraMessage: s.isActive === true ? 'Schedule enabled' : ''
    })).join('');
    
    if (!schedulesHtml) {
      schedulesHtml = '<tr><td colspan="5" class="px-6 py-8 text-center text-gray-500">No schedules found.</td></tr>';
    }
    
    if (totalSchedules > 10) {
      schedulesHtml += `
        <tr>
          <td colspan="5" class="px-6 py-4 bg-gray-50">
            <div class="flex items-center justify-between">
              <div class="text-sm text-gray-700">
                Showing ${skip + 1} to ${Math.min(skip + limit, totalSchedules)} of ${totalSchedules} schedules
              </div>
              <div class="flex gap-2">
                ${page > 1 ? `<button hx-get="/schedules?page=${page - 1}&limit=${limit}&search=${search}&status=${status}&frequency=${frequency}" hx-target="#schedules-list" hx-swap="innerHTML" class="px-3 py-1 bg-white border rounded hover:bg-gray-50">Previous</button>` : ''}
                <span class="px-3 py-1">Page ${page} of ${totalPages}</span>
                ${page < totalPages ? `<button hx-get="/schedules?page=${page + 1}&limit=${limit}&search=${search}&status=${status}&frequency=${frequency}" hx-target="#schedules-list" hx-swap="innerHTML" class="px-3 py-1 bg-white border rounded hover:bg-gray-50">Next</button>` : ''}
              </div>
            </div>
          </td>
        </tr>
      `;
    }
    
    res.send(schedulesHtml);
  } catch (error) {
    console.error('Error fetching schedules:', error);
    res.status(500).send('<tr><td colspan="5" class="px-6 py-4 text-center text-red-600">Error loading schedules</td></tr>');
  }
});

router.get('/:id/edit', isAuthenticated, async (req, res) => {
  try {
    const schedule = await Schedule.findOne({ _id: req.params.id, userId: req.user.userId });
    
    if (!schedule) {
      return res.status(404).send('<div class="text-red-600">Schedule not found</div>');
    }

    const scheduleDate = new Date(schedule.scheduleAt);
    const localDateTime = new Date(scheduleDate.getTime() - (scheduleDate.getTimezoneOffset() * 60000))
      .toISOString()
      .slice(0, 16);

    const isRecurring = schedule.frequency !== 'once';
    const intervalValue = schedule.interval || 1;
    const authType = schedule.authType || 'none';

    res.send(`
      <h2 class="text-2xl font-bold mb-6">Edit Schedule</h2>
      <form 
        hx-put="/schedules/${schedule._id}" 
        hx-target="#schedules-list" 
        hx-swap="innerHTML"
        hx-indicator="#edit-submit-spinner"
        hx-disabled-elt="#edit-submit-btn"
        class="space-y-4 max-h-[70vh] overflow-y-auto pr-2"
      >
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Schedule Name</label>
          <input 
            type="text" 
            name="name" 
            value="${schedule.name}"
            placeholder="e.g., Daily Data Sync"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          >
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Webhook URL</label>
          <div class="flex gap-2">
            <input 
              type="url" 
              name="webhookUrl" 
              value="${schedule.webhookUrl}"
              placeholder="https://your-n8n-webhook-url..."
              class="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            >
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">HTTP Method</label>
          <select 
            name="httpMethod" 
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="POST" ${schedule.httpMethod === 'POST' ? 'selected' : ''}>POST</option>
            <option value="GET" ${schedule.httpMethod === 'GET' ? 'selected' : ''}>GET</option>
            <option value="PUT" ${schedule.httpMethod === 'PUT' ? 'selected' : ''}>PUT</option>
            <option value="DELETE" ${schedule.httpMethod === 'DELETE' ? 'selected' : ''}>DELETE</option>
          </select>
        </div>

        <!-- Authentication Section -->
        <div class="border-t pt-4">
          <h3 class="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
            </svg>
            Authentication
          </h3>
          
          <div class="mb-3">
            <label class="block text-sm font-medium text-gray-700 mb-2">Authentication Type</label>
            <select 
              id="edit-auth-type" 
              name="authType" 
              onchange="toggleEditAuthFields()"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="none" ${authType === 'none' ? 'selected' : ''}>None</option>
              <option value="bearer" ${authType === 'bearer' ? 'selected' : ''}>Bearer Token</option>
              <option value="apikey" ${authType === 'apikey' ? 'selected' : ''}>API Key</option>
              <option value="basic" ${authType === 'basic' ? 'selected' : ''}>Basic Auth</option>
            </select>
          </div>

          <!-- Bearer Token -->
          <div id="edit-bearer-fields" class="${authType === 'bearer' ? '' : 'hidden'} space-y-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Bearer Token</label>
              <input 
                type="password" 
                name="authToken" 
                value="${schedule.authToken || ''}"
                placeholder="Enter your bearer token"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
              <p class="text-xs text-gray-500 mt-1">Will be sent as: Authorization: Bearer {token}</p>
            </div>
          </div>

          <!-- API Key -->
          <div id="edit-apikey-fields" class="${authType === 'apikey' ? '' : 'hidden'} space-y-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Header Name</label>
              <input 
                type="text" 
                name="authApiKeyName" 
                value="${schedule.authApiKeyName || ''}"
                placeholder="e.g., X-API-Key"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">API Key Value</label>
              <input 
                type="password" 
                name="authApiKeyValue" 
                value="${schedule.authApiKeyValue || ''}"
                placeholder="Enter your API key"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
            </div>
          </div>

          <!-- Basic Auth -->
          <div id="edit-basic-fields" class="${authType === 'basic' ? '' : 'hidden'} space-y-3">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Username</label>
              <input 
                type="text" 
                name="authUsername" 
                value="${schedule.authUsername || ''}"
                placeholder="Enter username"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Password</label>
              <input 
                type="password" 
                name="authPassword" 
                value="${schedule.authPassword || ''}"
                placeholder="Enter password"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
            </div>
          </div>
        </div>

        <!-- Custom Headers Section -->
        <div class="border-t pt-4">
          <h3 class="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"></path>
            </svg>
            Custom Headers
          </h3>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Headers (JSON)</label>
            <textarea 
              name="customHeaders" 
              rows="4"
              placeholder='{"X-Custom-Header": "value", "X-Request-ID": "12345"}'
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            >${schedule.customHeaders || '{}'}</textarea>
            <p class="text-xs text-gray-500 mt-1">Add custom headers as JSON key-value pairs</p>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Trigger Interval</label>
          <select 
            id="edit-frequency" 
            name="frequency" 
            onchange="toggleEditIntervalInput()"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="once" ${schedule.frequency === 'once' ? 'selected' : ''}>Once (One-time execution)</option>
            <option value="seconds" ${schedule.frequency === 'seconds' ? 'selected' : ''}>Seconds</option>
            <option value="minutes" ${schedule.frequency === 'minutes' ? 'selected' : ''}>Minutes</option>
            <option value="hours" ${schedule.frequency === 'hours' ? 'selected' : ''}>Hours</option>
            <option value="days" ${schedule.frequency === 'days' ? 'selected' : ''}>Days</option>
            <option value="weeks" ${schedule.frequency === 'weeks' ? 'selected' : ''}>Weeks</option>
            <option value="months" ${schedule.frequency === 'months' ? 'selected' : ''}>Months</option>
            <option value="years" ${schedule.frequency === 'years' ? 'selected' : ''}>Years</option>
          </select>
          <p class="text-xs text-gray-500 mt-1">Choose how often this schedule should run</p>
        </div>

        <div id="edit-interval-container" class="${isRecurring ? '' : 'hidden'}">
          <label class="block text-sm font-medium text-gray-700 mb-2">Every</label>
          <div class="flex items-center gap-2">
            <input 
              type="number" 
              id="edit-interval" 
              name="interval" 
              min="1" 
              value="${intervalValue}"
              class="w-24 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
            <span id="edit-interval-unit" class="text-sm text-gray-600">${schedule.frequency === 'once' ? 'second(s)' : schedule.frequency}</span>
          </div>
          <p class="text-xs text-gray-500 mt-1">Specify the interval (e.g., every 5 minutes)</p>
        </div>

        <!-- Time-Specific Scheduling Section -->
        <div id="edit-time-specific-container" class="${isRecurring && ['hours', 'days', 'weeks', 'months', 'years'].includes(schedule.frequency) ? '' : 'hidden'} border-t pt-4">
          <h3 class="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            Specific Time (Optional)
          </h3>
          
          <div class="mb-3">
            <label class="flex items-center gap-2 cursor-pointer">
              <input 
                type="checkbox" 
                id="edit-use-specific-time" 
                name="useSpecificTime" 
                value="true"
                ${schedule.useSpecificTime ? 'checked' : ''}
                onchange="toggleEditSpecificTimeFields()"
                class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              >
              <span class="text-sm font-medium text-gray-700">Run at specific time</span>
            </label>
            <p class="text-xs text-gray-500 mt-1 ml-6">Enable to run at a specific time (e.g., every day at 8:00 AM)</p>
          </div>

          <div id="edit-specific-time-fields" class="${schedule.useSpecificTime ? '' : 'hidden'} space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Hour (0-23)</label>
                <input 
                  type="number" 
                  name="specificHour" 
                  min="0" 
                  max="23"
                  value="${schedule.specificHour !== null ? schedule.specificHour : ''}"
                  placeholder="8"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 mb-2">Minute (0-59)</label>
                <input 
                  type="number" 
                  name="specificMinute" 
                  min="0" 
                  max="59"
                  value="${schedule.specificMinute !== null ? schedule.specificMinute : ''}"
                  placeholder="0"
                  class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
              </div>
            </div>

            <!-- Days of Week (for weekly schedules) -->
            <div id="edit-days-of-week-container" class="${schedule.frequency === 'weeks' ? '' : 'hidden'}">
              <label class="block text-sm font-medium text-gray-700 mb-2">Days of Week</label>
              <div class="grid grid-cols-7 gap-2">
                ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => `
                  <label class="flex flex-col items-center gap-1 cursor-pointer">
                    <input 
                      type="checkbox" 
                      name="daysOfWeek[]" 
                      value="${index}"
                      ${schedule.daysOfWeek && schedule.daysOfWeek.includes(index) ? 'checked' : ''}
                      class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    >
                    <span class="text-xs text-gray-600">${day}</span>
                  </label>
                `).join('')}
              </div>
              <p class="text-xs text-gray-500 mt-1">Select which days of the week to run</p>
            </div>

            <!-- Day of Month (for monthly schedules) -->
            <div id="edit-day-of-month-container" class="${schedule.frequency === 'months' ? '' : 'hidden'}">
              <label class="block text-sm font-medium text-gray-700 mb-2">Day of Month (1-31)</label>
              <input 
                type="number" 
                name="dayOfMonth" 
                min="1" 
                max="31"
                value="${schedule.dayOfMonth !== null ? schedule.dayOfMonth : ''}"
                placeholder="1"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
              <p class="text-xs text-gray-500 mt-1">Which day of the month to run (e.g., 1 for first day)</p>
            </div>

            <div class="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p class="text-sm text-blue-800">
                <strong>Example:</strong> 
                <span id="edit-time-example">Every day at 8:00 AM</span>
              </p>
            </div>
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">JSON Body</label>
          <textarea 
            name="jsonBody" 
            rows="6"
            placeholder='{"key": "value", "user_id": 123}'
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
          >${schedule.jsonBody}</textarea>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-2">Start Date & Time</label>
          <input 
            type="datetime-local" 
            name="scheduleAt" 
            value="${localDateTime}"
            class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            required
          >
          <p class="text-xs text-gray-500 mt-1">For recurring schedules, this is the first execution time</p>
        </div>

        <!-- Webhook Timeout Section -->
        <div class="border-t pt-4">
          <h3 class="text-lg font-semibold text-gray-800 mb-3 flex items-center gap-2">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            Webhook Timeout
          </h3>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-2">Timeout (seconds)</label>
            <input 
              type="number" 
              name="timeout" 
              min="1" 
              max="600"
              value="${schedule.timeout ? schedule.timeout / 1000 : 30}"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
            <p class="text-xs text-gray-500 mt-1">How long to wait for webhook response (1-600 seconds, default: 30s)</p>
            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2">
              <p class="text-xs text-yellow-800">
                <strong>💡 For long-running n8n workflows:</strong><br>
                Set a higher timeout (e.g., 300 seconds = 5 minutes) to keep the connection alive until your workflow completes.
              </p>
            </div>
          </div>
        </div>

        <div class="flex gap-4 pt-4 sticky bottom-0 bg-white pb-2">
          <button 
            id="edit-submit-btn"
            type="submit"
            class="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <span id="edit-submit-spinner" class="htmx-indicator">
              <svg class="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </span>
            Update Schedule
          </button>
          <button 
            type="button"
            onclick="document.getElementById('modal').classList.add('hidden')"
            class="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold"
          >
            Cancel
          </button>
        </div>
      </form>

      <script>
        // Toggle interval input for edit form
        function toggleEditIntervalInput() {
          const frequency = document.getElementById('edit-frequency').value;
          const intervalContainer = document.getElementById('edit-interval-container');
          const intervalUnit = document.getElementById('edit-interval-unit');
          const timeSpecificContainer = document.getElementById('edit-time-specific-container');
          
          if (frequency === 'once') {
            intervalContainer.classList.add('hidden');
            timeSpecificContainer.classList.add('hidden');
          } else {
            intervalContainer.classList.remove('hidden');
            intervalUnit.textContent = frequency;
            
            // Show time-specific options for hours, days, weeks, months, years
            if (['hours', 'days', 'weeks', 'months', 'years'].includes(frequency)) {
              timeSpecificContainer.classList.remove('hidden');
              toggleEditSpecificTimeFields();
            } else {
              timeSpecificContainer.classList.add('hidden');
            }
          }
        }

        // Toggle specific time fields for edit form
        function toggleEditSpecificTimeFields() {
          const useSpecificTime = document.getElementById('edit-use-specific-time').checked;
          const specificTimeFields = document.getElementById('edit-specific-time-fields');
          const frequency = document.getElementById('edit-frequency').value;
          const daysOfWeekContainer = document.getElementById('edit-days-of-week-container');
          const dayOfMonthContainer = document.getElementById('edit-day-of-month-container');
          
          if (useSpecificTime) {
            specificTimeFields.classList.remove('hidden');
            
            // Show/hide day selection based on frequency
            if (frequency === 'weeks') {
              daysOfWeekContainer.classList.remove('hidden');
              dayOfMonthContainer.classList.add('hidden');
            } else if (frequency === 'months') {
              daysOfWeekContainer.classList.add('hidden');
              dayOfMonthContainer.classList.remove('hidden');
            } else {
              daysOfWeekContainer.classList.add('hidden');
              dayOfMonthContainer.classList.add('hidden');
            }
          } else {
            specificTimeFields.classList.add('hidden');
          }
        }

        // Toggle authentication fields for edit form
        function toggleEditAuthFields() {
          const authType = document.getElementById('edit-auth-type').value;
          document.getElementById('edit-bearer-fields').classList.add('hidden');
          document.getElementById('edit-apikey-fields').classList.add('hidden');
          document.getElementById('edit-basic-fields').classList.add('hidden');
          
          if (authType === 'bearer') {
            document.getElementById('edit-bearer-fields').classList.remove('hidden');
          } else if (authType === 'apikey') {
            document.getElementById('edit-apikey-fields').classList.remove('hidden');
          } else if (authType === 'basic') {
            document.getElementById('edit-basic-fields').classList.remove('hidden');
          }
        }

        // Initialize on load
        toggleEditIntervalInput();
        toggleEditAuthFields();
      </script>
    `);
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).send('<div class="text-red-600">Error loading schedule</div>');
  }
});

router.post('/', isAuthenticated, async (req, res) => {
  try {
    const { 
      name, webhookUrl, httpMethod, jsonBody, scheduleAt, frequency, interval, timezone, timeout,
      authType, authToken, authApiKeyName, authApiKeyValue, authUsername, authPassword,
      customHeaders,
      useSpecificTime, specificHour, specificMinute, daysOfWeek, dayOfMonth
    } = req.body;

    if (!name || !webhookUrl || !scheduleAt) {
      return res.status(400).send('<tr><td colspan="5" class="px-6 py-4 text-center text-red-600">Name, webhook URL, and schedule time are required</td></tr>');
    }

    const scheduleDate = new Date(scheduleAt);
    
    if (isNaN(scheduleDate.getTime())) {
      return res.status(400).send('<tr><td colspan="5" class="px-6 py-4 text-center text-red-600">Invalid date/time format</td></tr>');
    }

    const isRecurring = frequency && frequency !== 'once';
    const intervalValue = interval ? parseInt(interval) : 1;
    
    let parsedDaysOfWeek = [];
    if (daysOfWeek) {
      try {
        parsedDaysOfWeek = typeof daysOfWeek === 'string' ? JSON.parse(daysOfWeek) : daysOfWeek;
      } catch (e) {
        parsedDaysOfWeek = [];
      }
    }

    const schedule = new Schedule({
      userId: req.user.userId,
      name: name.trim(),
      webhookUrl: webhookUrl.trim(),
      httpMethod: httpMethod || 'POST',
      jsonBody: jsonBody || '{}',
      scheduleAt: scheduleDate,
      frequency: frequency || 'once',
      interval: intervalValue,
      isRecurring: isRecurring,
      timezone: timezone || 'UTC',
      timeout: timeout ? parseInt(timeout) * 1000 : 30000,
      authType: authType || 'none',
      authToken: authToken || null,
      authApiKeyName: authApiKeyName || null,
      authApiKeyValue: authApiKeyValue || null,
      authUsername: authUsername || null,
      authPassword: authPassword || null,
      customHeaders: customHeaders || '{}',
      useSpecificTime: useSpecificTime === 'true' || useSpecificTime === true,
      specificHour: specificHour ? parseInt(specificHour) : null,
      specificMinute: specificMinute ? parseInt(specificMinute) : null,
      daysOfWeek: parsedDaysOfWeek,
      dayOfMonth: dayOfMonth ? parseInt(dayOfMonth) : null
    });

    await schedule.save();
    console.log(`[OK] Schedule created: ${schedule.name} (ID: ${schedule._id})`);

    scheduleCronJob(schedule);

    const schedules = await Schedule.find({ userId: req.user.userId }).sort({ createdAt: -1 }).limit(20);
    const schedulesHtml = schedules.map(s => generateScheduleRow(s)).join('');
    
    if (!schedulesHtml) {
      return res.send('<tr><td colspan="5" class="px-6 py-8 text-center text-gray-500">No schedules found.</td></tr>');
    }
    
    res.send(schedulesHtml);
  } catch (error) {
    console.error('Error creating schedule:', error);
    
    let errorMessage = 'Error creating schedule';
    if (error.name === 'ValidationError') {
      errorMessage = Object.values(error.errors).map(e => e.message).join(', ');
    } else if (error.code === 11000) {
      errorMessage = 'Duplicate schedule detected';
    }
    
    res.status(500).send(`<tr><td colspan="5" class="px-6 py-4 text-center text-red-600">${errorMessage}</td></tr>`);
  }
});

router.put('/:id', isAuthenticated, async (req, res) => {
  try {
    const { 
      name, webhookUrl, httpMethod, jsonBody, scheduleAt, frequency, interval, timeout,
      authType, authToken, authApiKeyName, authApiKeyValue, authUsername, authPassword,
      customHeaders,
      useSpecificTime, specificHour, specificMinute, daysOfWeek, dayOfMonth
    } = req.body;

    const isRecurring = frequency && frequency !== 'once';
    const intervalValue = interval ? parseInt(interval) : 1;
    
    let parsedDaysOfWeek = [];
    if (daysOfWeek) {
      try {
        parsedDaysOfWeek = typeof daysOfWeek === 'string' ? JSON.parse(daysOfWeek) : daysOfWeek;
      } catch (e) {
        parsedDaysOfWeek = [];
      }
    }

    const schedule = await Schedule.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.userId },
      {
        name,
        webhookUrl,
        httpMethod: httpMethod || 'POST',
        jsonBody: jsonBody || '{}',
        scheduleAt: new Date(scheduleAt),
        frequency: frequency || 'once',
        interval: intervalValue,
        isRecurring: isRecurring,
        timeout: timeout ? parseInt(timeout) * 1000 : 30000,
        status: 'Pending',
        lastExecuted: null,
        executionCount: 0,
        authType: authType || 'none',
        authToken: authToken || null,
        authApiKeyName: authApiKeyName || null,
        authApiKeyValue: authApiKeyValue || null,
        authUsername: authUsername || null,
        authPassword: authPassword || null,
        customHeaders: customHeaders || '{}',
        useSpecificTime: useSpecificTime === 'true' || useSpecificTime === true,
        specificHour: specificHour ? parseInt(specificHour) : null,
        specificMinute: specificMinute ? parseInt(specificMinute) : null,
        daysOfWeek: parsedDaysOfWeek,
        dayOfMonth: dayOfMonth ? parseInt(dayOfMonth) : null
      },
      { new: true }
    );

    if (!schedule) {
      return res.status(404).send('<tr><td colspan="5" class="px-6 py-4 text-center text-red-600">Schedule not found</td></tr>');
    }

    cancelCronJob(schedule._id.toString());
    scheduleCronJob(schedule);
    
    const updatedSchedule = await Schedule.findById(schedule._id);

    const schedules = await Schedule.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    const schedulesHtml = schedules.map(s => generateScheduleRow(s)).join('');
    res.send(schedulesHtml);
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).send('<tr><td colspan="5" class="px-6 py-4 text-center text-red-600">Error updating schedule</td></tr>');
  }
});

router.delete('/:id', isAuthenticated, async (req, res) => {
  try {
    const schedule = await Schedule.findOneAndDelete({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });

    if (!schedule) {
      return res.status(404).send('<tr><td colspan="5" class="px-6 py-4 text-center text-red-600">Schedule not found</td></tr>');
    }

    cancelCronJob(schedule._id.toString());

    const schedules = await Schedule.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    const schedulesHtml = schedules.map(s => generateScheduleRow(s)).join('');
    res.send(schedulesHtml || '<tr><td colspan="5" class="px-6 py-8 text-center text-gray-500">No schedules found. Create your first schedule!</td></tr>');
  } catch (error) {
    console.error('Error deleting schedule:', error);
    res.status(500).send('<tr><td colspan="5" class="px-6 py-4 text-center text-red-600">Error deleting schedule</td></tr>');
  }
});

router.delete('/all/delete', isAuthenticated, async (req, res) => {
  try {
    const schedules = await Schedule.find({ userId: req.user.userId });
    
    for (const schedule of schedules) {
      cancelCronJob(schedule._id.toString());
    }
    
    await Schedule.deleteMany({ userId: req.user.userId });

    res.send('<tr><td colspan="5" class="px-6 py-8 text-center text-gray-500">All schedules deleted. Create your first schedule!</td></tr>');
  } catch (error) {
    console.error('Error deleting all schedules:', error);
    res.status(500).send('<tr><td colspan="5" class="px-6 py-4 text-center text-red-600">Error deleting schedules</td></tr>');
  }
});

router.post('/:id/toggle', isAuthenticated, async (req, res) => {
  try {
    const schedule = await Schedule.findOne({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });

    if (!schedule) {
      return res.status(404).send('<tr><td colspan="5" class="px-6 py-4 text-center text-red-600">Schedule not found</td></tr>');
    }

    schedule.isActive = !schedule.isActive;
    await schedule.save();

    if (schedule.isActive) {
      scheduleCronJob(schedule);
      console.log(`[OK] Schedule "${schedule.name}" enabled`);
    } else {
      cancelCronJob(schedule._id.toString());
      console.log(`[OK] Schedule "${schedule.name}" disabled`);
    }

    const schedules = await Schedule.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    const schedulesHtml = schedules.map(s => {
      const isToggledSchedule = s._id.toString() === schedule._id.toString();
      let message = '';
      
      if (isToggledSchedule) {
        message = schedule.isActive ? 'Schedule enabled' : 'Schedule paused';
      } else {
        message = s.isActive === true ? 'Schedule enabled' : '';
      }
      
      return generateScheduleRow(s, {
        highlight: isToggledSchedule,
        extraMessage: message
      });
    }).join('');
    
    res.send(schedulesHtml || '<tr><td colspan="5" class="px-6 py-8 text-center text-gray-500">No schedules found.</td></tr>');
  } catch (error) {
    console.error('Error toggling schedule:', error);
    res.status(500).send('<tr><td colspan="5" class="px-6 py-4 text-center text-red-600">Error updating schedule</td></tr>');
  }
});

router.post('/:id/trigger', isAuthenticated, async (req, res) => {
  try {
    const schedule = await Schedule.findOne({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });

    if (!schedule) {
      return res.status(404).send('<tr><td colspan="5" class="px-6 py-4 text-center text-red-600">Schedule not found</td></tr>');
    }

    await executeWebhook(schedule, 'Manual');

    const schedules = await Schedule.find({ userId: req.user.userId }).sort({ createdAt: -1 });
    const schedulesHtml = schedules.map(s => {
      if (s._id.toString() === schedule._id.toString()) {
        return generateScheduleRow(s, { highlight: true, extraMessage: 'Triggered manually' });
      }
      return generateScheduleRow(s);
    }).join('');
    res.send(schedulesHtml);
  } catch (error) {
    console.error('Error triggering schedule:', error);
    res.status(500).send('<tr><td colspan="5" class="px-6 py-4 text-center text-red-600">Error triggering schedule</td></tr>');
  }
});

module.exports = router;
