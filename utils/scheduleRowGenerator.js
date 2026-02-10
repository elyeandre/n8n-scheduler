function generateScheduleRow(s, options = {}) {
  const { highlight = false, extraMessage = '' } = options;
  const interval = s.interval || 1;
  let frequencyText = s.frequency;
  
  if (s.frequency !== 'once' && interval > 1) {
    frequencyText = `${interval} ${s.frequency}`;
  }
  
  const frequencyBadge = s.frequency !== 'once' ? `<span class="ml-2 px-2 py-0.5 bg-purple-100 text-purple-800 text-xs rounded">${frequencyText}</span>` : '';
  
  let nextExecTime = '';
  const executionCount = s.executionCount || 0;
  
  if (s.frequency === 'once') {
    // For "once" schedules
    if (s.status === 'Pending' && s.nextExecution) {
      // Not executed yet - show when it will run
      nextExecTime = `<br><small class="text-gray-500">Scheduled for: ${new Date(s.nextExecution).toLocaleString()}</small>`;
    } else if (s.status === 'Executed' && s.lastExecuted) {
      nextExecTime = `<br><small class="text-green-600">Executed: ${new Date(s.lastExecuted).toLocaleString()}</small>`;
      if (executionCount > 0) {
        nextExecTime += `<br><small class="text-gray-400">Executed ${executionCount} time${executionCount > 1 ? 's' : ''}</small>`;
      }
    } else if (s.status === 'Failed' && s.lastExecuted) {
      nextExecTime = `<br><small class="text-red-600">Failed: ${new Date(s.lastExecuted).toLocaleString()}</small>`;
      if (executionCount > 0) {
        nextExecTime += `<br><small class="text-gray-400">Attempted ${executionCount} time${executionCount > 1 ? 's' : ''}</small>`;
      }
    }
  } else {
    // For recurring schedules
    const hasExecutedBefore = s.lastExecuted && executionCount > 0;
    
    if (hasExecutedBefore) {
      // Show last execution (only if executed at least once)
      nextExecTime = `<br><small class="text-gray-500">Last: ${new Date(s.lastExecuted).toLocaleString()}</small>`;
      
      // Show execution count
      nextExecTime += `<br><small class="text-gray-400">Executed ${executionCount} time${executionCount > 1 ? 's' : ''}</small>`;
      
      // Show next execution (for both Pending and Failed status - recurring schedules continue)
      if (s.nextExecution) {
        nextExecTime += `<br><small class="text-blue-600">Next: ${new Date(s.nextExecution).toLocaleString()}</small>`;
      }
    } else {
      // First time - not executed yet, just show when it will start
      if (s.nextExecution) {
        nextExecTime = `<br><small class="text-blue-600">First run: ${new Date(s.nextExecution).toLocaleString()}</small>`;
      }
    }
  }
  
  const highlightClass = highlight ? 'bg-green-50' : '';
  
  return `
    <tr class="border-b hover:bg-gray-50 ${highlightClass}">
      <td class="px-6 py-4">${s.name}${frequencyBadge}</td>
      <td class="px-6 py-4 text-sm text-blue-600 truncate max-w-xs" title="${s.webhookUrl}">${s.webhookUrl}</td>
      <td class="px-6 py-4 text-sm">${new Date(s.scheduleAt).toLocaleString()}${nextExecTime}</td>
      <td class="px-6 py-4">
        <span class="px-3 py-1 rounded-full text-xs font-semibold ${
          s.status === 'Executed' ? 'bg-green-100 text-green-800' :
          s.status === 'Pending' ? 'bg-blue-100 text-blue-800' :
          s.status === 'Failed' ? 'bg-red-100 text-red-800' :
          'bg-gray-100 text-gray-800'
        }">${s.status}</span>
        ${s.isActive === false ? '<span class="ml-2 px-2 py-0.5 bg-gray-200 text-gray-600 text-xs rounded">Paused</span>' : ''}
        ${extraMessage ? `<small class="block text-xs text-gray-500 mt-1">${extraMessage}</small>` : ''}
      </td>
      <td class="px-6 py-4 text-center">
        <div class="relative inline-block">
          <button 
            onclick="toggleMenu('menu-${s._id}', event)"
            class="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            title="Actions"
          >
            <svg class="w-5 h-5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M6 10a2 2 0 11-4 0 2 2 0 014 0zM12 10a2 2 0 11-4 0 2 2 0 014 0zM16 12a2 2 0 100-4 2 2 0 000 4z"/>
            </svg>
          </button>
          <div 
            id="menu-${s._id}" 
            class="hidden fixed w-48 rounded-lg shadow-2xl bg-white border border-gray-200"
            style="z-index: 9999;"
            role="menu"
          >
            <div class="py-1" role="none">
              <button 
                hx-post="/schedules/${s._id}/trigger" 
                hx-target="#schedules-list"
                hx-swap="innerHTML"
                class="w-full text-left px-4 py-2 text-sm text-green-700 hover:bg-green-50 flex items-center gap-2"
                onclick="toggleMenu('menu-${s._id}', event)"
                role="menuitem"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                Trigger Now
              </button>
              <button 
                hx-get="/schedules/${s._id}/edit" 
                hx-target="#modal-content"
                hx-swap="innerHTML"
                class="w-full text-left px-4 py-2 text-sm text-blue-700 hover:bg-blue-50 flex items-center gap-2"
                onclick="document.getElementById('modal').classList.remove('hidden'); toggleMenu('menu-${s._id}', event)"
                role="menuitem"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                </svg>
                Edit
              </button>
              <button 
                hx-post="/schedules/${s._id}/toggle" 
                hx-target="#schedules-list"
                hx-swap="innerHTML"
                class="w-full text-left px-4 py-2 text-sm ${s.isActive ? 'text-yellow-700 hover:bg-yellow-50' : 'text-green-700 hover:bg-green-50'} flex items-center gap-2 border-t border-gray-100"
                onclick="toggleMenu('menu-${s._id}', event)"
                role="menuitem"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  ${s.isActive 
                    ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"/>'
                    : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>'
                  }
                </svg>
                ${s.isActive ? 'Pause' : 'Enable'}
              </button>
              <button 
                hx-delete="/schedules/${s._id}" 
                hx-confirm="Are you sure you want to delete this schedule?"
                hx-target="#schedules-list"
                hx-swap="innerHTML"
                class="w-full text-left px-4 py-2 text-sm text-red-700 hover:bg-red-50 flex items-center gap-2 border-t border-gray-100"
                onclick="toggleMenu('menu-${s._id}', event)"
                role="menuitem"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
                Delete
              </button>
            </div>
          </div>
        </div>
      </td>
    </tr>
  `;
}

module.exports = { generateScheduleRow };
