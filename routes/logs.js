const express = require('express');
const router = express.Router();
const ExecutionLog = require('../models/ExecutionLog');
const Schedule = require('../models/Schedule');
const { isAuthenticated } = require('../middleware/auth');

router.get('/', isAuthenticated, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';
    const status = req.query.status || '';
    const triggeredBy = req.query.triggeredBy || '';

    const query = { userId: req.user.userId };
    
    if (search) {
      query.$or = [
        { scheduleName: { $regex: search, $options: 'i' } },
        { webhookUrl: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) {
      query.status = status;
    }
    
    if (triggeredBy) {
      query.triggeredBy = triggeredBy;
    }

    const totalLogs = await ExecutionLog.countDocuments(query);
    const logs = await ExecutionLog.find(query)
      .sort({ executedAt: -1 })
      .limit(limit)
      .skip(skip);

    const totalPages = Math.ceil(totalLogs / limit);

    let logsHtml = logs.map(log => `
      <tr class="${log.status === 'Success' ? 'hover:bg-green-50' : 'hover:bg-red-50'} transition-colors">
        <td class="px-6 py-4 whitespace-nowrap">
          <div class="text-sm font-medium text-gray-900">${log.scheduleName}</div>
          <div class="text-xs text-gray-500">${log.scheduleId}</div>
        </td>
        <td class="px-6 py-4">
          <div class="text-sm text-gray-900">${log.webhookUrl}</div>
          <div class="text-xs text-gray-500">${log.httpMethod}</div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          <span class="px-3 py-1 rounded-full text-xs font-semibold ${
            log.status === 'Success' 
              ? 'bg-green-100 text-green-800' 
              : 'bg-red-100 text-red-800'
          }">
            ${log.status}
          </span>
          ${log.responseStatus ? `<div class="text-xs text-gray-500 mt-1">HTTP ${log.responseStatus}</div>` : ''}
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          <span class="px-2 py-1 rounded text-xs font-medium ${
            log.triggeredBy === 'Manual' 
              ? 'bg-purple-100 text-purple-800' 
              : 'bg-blue-100 text-blue-800'
          }">
            ${log.triggeredBy}
          </span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          <div class="text-sm text-gray-900">${new Date(log.executedAt).toLocaleString()}</div>
          ${log.executionTime ? `<div class="text-xs text-gray-500">${log.executionTime}ms</div>` : ''}
        </td>
        <td class="px-6 py-4 text-center">
          <button 
            onclick="viewLogDetails('${log._id}')"
            class="text-blue-600 hover:text-blue-800 text-sm font-medium"
          >
            View Details
          </button>
        </td>
      </tr>
    `).join('');
    
    if (!logsHtml) {
      logsHtml = '<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500">No execution logs found.</td></tr>';
    }
    
    if (totalLogs > 10) {
      logsHtml += `
        <tr>
          <td colspan="6" class="px-6 py-4 bg-gray-50">
            <div class="flex items-center justify-between">
              <div class="text-sm text-gray-700">
                Showing ${skip + 1} to ${Math.min(skip + limit, totalLogs)} of ${totalLogs} logs
              </div>
              <div class="flex gap-2">
                ${page > 1 ? `<button hx-get="/logs?page=${page - 1}&limit=${limit}&search=${encodeURIComponent(search)}&status=${status}&triggeredBy=${triggeredBy}" hx-target="#logs-list" hx-swap="innerHTML" class="px-3 py-1 bg-white border rounded hover:bg-gray-50">Previous</button>` : ''}
                <span class="px-3 py-1">Page ${page} of ${totalPages}</span>
                ${page < totalPages ? `<button hx-get="/logs?page=${page + 1}&limit=${limit}&search=${encodeURIComponent(search)}&status=${status}&triggeredBy=${triggeredBy}" hx-target="#logs-list" hx-swap="innerHTML" class="px-3 py-1 bg-white border rounded hover:bg-gray-50">Next</button>` : ''}
              </div>
            </div>
          </td>
        </tr>
      `;
    }

    res.send(logsHtml);
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).send('<tr><td colspan="6" class="px-6 py-4 text-center text-red-600">Error loading logs</td></tr>');
  }
});

router.get('/:id/details', isAuthenticated, async (req, res) => {
  try {
    const log = await ExecutionLog.findOne({ 
      _id: req.params.id, 
      userId: req.user.userId 
    });

    if (!log) {
      return res.status(404).send('<div class="text-red-600">Log not found</div>');
    }

    res.send(`
      <h2 class="text-2xl font-bold mb-6">Execution Log Details</h2>
      
      <div class="space-y-4">
        <div class="bg-gray-50 p-4 rounded-lg">
          <h3 class="font-semibold text-gray-700 mb-2">Schedule Information</h3>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span class="text-gray-600">Name:</span>
              <span class="ml-2 font-medium">${log.scheduleName}</span>
            </div>
            <div>
              <span class="text-gray-600">Schedule ID:</span>
              <span class="ml-2 font-mono text-xs">${log.scheduleId}</span>
            </div>
            <div>
              <span class="text-gray-600">Webhook URL:</span>
              <span class="ml-2 font-medium break-all">${log.webhookUrl}</span>
            </div>
            <div>
              <span class="text-gray-600">HTTP Method:</span>
              <span class="ml-2 font-medium">${log.httpMethod}</span>
            </div>
          </div>
        </div>

        <div class="bg-gray-50 p-4 rounded-lg">
          <h3 class="font-semibold text-gray-700 mb-2">Execution Details</h3>
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span class="text-gray-600">Status:</span>
              <span class="ml-2 px-3 py-1 rounded-full text-xs font-semibold ${
                log.status === 'Success' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }">
                ${log.status}
              </span>
            </div>
            <div>
              <span class="text-gray-600">Triggered By:</span>
              <span class="ml-2 px-2 py-1 rounded text-xs font-medium ${
                log.triggeredBy === 'Manual' 
                  ? 'bg-purple-100 text-purple-800' 
                  : 'bg-blue-100 text-blue-800'
              }">
                ${log.triggeredBy}
              </span>
            </div>
            <div>
              <span class="text-gray-600">Executed At:</span>
              <span class="ml-2 font-medium">${new Date(log.executedAt).toLocaleString()}</span>
            </div>
            <div>
              <span class="text-gray-600">Execution Time:</span>
              <span class="ml-2 font-medium">${log.executionTime || 'N/A'}ms</span>
            </div>
            ${log.responseStatus ? `
            <div>
              <span class="text-gray-600">Response Status:</span>
              <span class="ml-2 font-medium">HTTP ${log.responseStatus}</span>
            </div>
            ` : ''}
          </div>
        </div>

        ${log.responseData ? `
                ${log.responseData ? `
        <div class="bg-gray-50 p-4 rounded-lg">
          <div class="flex justify-between items-center mb-2">
            <h3 class="font-semibold text-gray-700">Response Data</h3>
            <button 
              onclick="copyResponseData(event, '${log._id}')"
              class="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 flex items-center gap-1"
              title="Copy to clipboard"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
              </svg>
              Copy
            </button>
          </div>
          <div class="bg-white p-3 rounded border max-h-96 overflow-y-auto">
            <pre id="response-data-${log._id}" class="text-xs whitespace-pre-wrap break-words">${(() => {
              try {
                // Try to parse and format JSON
                const parsed = JSON.parse(log.responseData);
                return JSON.stringify(parsed, null, 2);
              } catch (e) {
                // If not JSON, return as is
                return log.responseData;
              }
            })()}</pre>
          </div>
        </div>
        ` : ''}
        ` : ''}

        ${log.errorMessage ? `
        <div class="bg-red-50 p-4 rounded-lg border border-red-200">
          <h3 class="font-semibold text-red-700 mb-2">Error Message</h3>
          <pre class="text-sm text-red-800">${log.errorMessage}</pre>
        </div>
        ` : ''}

        <div class="flex justify-end pt-4">
          <button 
            type="button"
            onclick="document.getElementById('modal').classList.add('hidden')"
            class="px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-semibold"
          >
            Close
          </button>
        </div>
      </div>
    `);
  } catch (error) {
    console.error('Error fetching log details:', error);
    res.status(500).send('<div class="text-red-600">Error loading log details</div>');
  }
});

router.delete('/all/purge', isAuthenticated, async (req, res) => {
  try {
    await ExecutionLog.deleteMany({ userId: req.user.userId });
    res.send('<tr><td colspan="6" class="px-6 py-8 text-center text-gray-500">All logs purged.</td></tr>');
  } catch (error) {
    console.error('Error purging logs:', error);
    res.status(500).send('<tr><td colspan="6" class="px-6 py-4 text-center text-red-600">Error purging logs</td></tr>');
  }
});

router.delete('/cleanup', isAuthenticated, async (req, res) => {
  try {
    const daysToKeep = parseInt(req.query.days) || 30;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await ExecutionLog.deleteMany({
      userId: req.user.userId,
      executedAt: { $lt: cutoffDate }
    });

    res.json({ 
      success: true, 
      message: `Deleted ${result.deletedCount} logs older than ${daysToKeep} days` 
    });
  } catch (error) {
    console.error('Error cleaning up logs:', error);
    res.status(500).json({ success: false, message: 'Error cleaning up logs' });
  }
});

module.exports = router;
