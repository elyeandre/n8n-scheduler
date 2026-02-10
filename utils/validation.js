function isValidEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim().toLowerCase());
}

function isValidPassword(password) {
  if (!password || typeof password !== 'string') {
    return { valid: false, message: 'Password is required' };
  }
  
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  
  if (password.length > 128) {
    return { valid: false, message: 'Password must be less than 128 characters' };
  }
  
  // Check for at least one letter and one number
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  
  if (!hasLetter || !hasNumber) {
    return { valid: false, message: 'Password must contain at least one letter and one number' };
  }
  
  return { valid: true };
}

function isValidURL(url) {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch (error) {
    return false;
  }
}

function isValidWebhookURL(url) {
  if (!isValidURL(url)) {
    return { valid: false, message: 'Invalid URL format' };
  }
  
  try {
    const urlObj = new URL(url);
    
    // Check for localhost/private IPs in production
    if (process.env.NODE_ENV === 'production') {
      const hostname = urlObj.hostname.toLowerCase();
      
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        return { valid: false, message: 'Localhost URLs are not allowed in production' };
      }
      
      if (isPrivateIP(hostname)) {
        return { valid: false, message: 'Private IP addresses are not allowed' };
      }
    }
    
    return { valid: true };
  } catch (error) {
    return { valid: false, message: 'Invalid URL' };
  }
}

function isPrivateIP(hostname) {
  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^fc00:/,
    /^fe80:/
  ];
  
  return privateRanges.some(range => range.test(hostname));
}

function isValidJSON(str) {
  if (!str || typeof str !== 'string') {
    return { valid: false, message: 'JSON string is required' };
  }
  
  try {
    JSON.parse(str);
    return { valid: true };
  } catch (error) {
    return { valid: false, message: 'Invalid JSON format: ' + error.message };
  }
}

function isValidName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, message: 'Name is required' };
  }
  
  const trimmedName = name.trim();
  
  if (trimmedName.length < 2) {
    return { valid: false, message: 'Name must be at least 2 characters long' };
  }
  
  if (trimmedName.length > 100) {
    return { valid: false, message: 'Name must be less than 100 characters' };
  }
  
  // Only allow letters, spaces, hyphens, and apostrophes
  const nameRegex = /^[a-zA-Z\s\-']+$/;
  if (!nameRegex.test(trimmedName)) {
    return { valid: false, message: 'Name can only contain letters, spaces, hyphens, and apostrophes' };
  }
  
  return { valid: true };
}

function isValidScheduleName(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, message: 'Schedule name is required' };
  }
  
  const trimmedName = name.trim();
  
  if (trimmedName.length < 3) {
    return { valid: false, message: 'Schedule name must be at least 3 characters long' };
  }
  
  if (trimmedName.length > 200) {
    return { valid: false, message: 'Schedule name must be less than 200 characters' };
  }
  
  return { valid: true };
}

function isValidTimezone(timezone) {
  if (!timezone || typeof timezone !== 'string') {
    return false;
  }
  
  try {
    // Try to create a date with the timezone
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return true;
  } catch (error) {
    return false;
  }
}

function isValidInterval(interval, frequency) {
  const num = parseInt(interval);
  
  if (isNaN(num) || num < 1) {
    return { valid: false, message: 'Interval must be a positive number' };
  }
  
  const limits = {
    seconds: 3600, // Max 1 hour in seconds
    minutes: 1440, // Max 24 hours in minutes
    hours: 168,    // Max 1 week in hours
    days: 365,     // Max 1 year in days
    weeks: 52,     // Max 1 year in weeks
    months: 12,    // Max 1 year in months
    years: 10      // Max 10 years
  };
  
  const maxInterval = limits[frequency] || 1;
  
  if (num > maxInterval) {
    return { valid: false, message: `Interval for ${frequency} cannot exceed ${maxInterval}` };
  }
  
  return { valid: true };
}

function sanitizeHTML(str) {
  if (!str || typeof str !== 'string') {
    return '';
  }
  
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

function isValidHTTPMethod(method) {
  const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  return validMethods.includes(method?.toUpperCase());
}

function isValidFrequency(frequency) {
  const validFrequencies = ['once', 'seconds', 'minutes', 'hours', 'days', 'weeks', 'months', 'years'];
  return validFrequencies.includes(frequency?.toLowerCase());
}

function isValidDate(dateString) {
  if (!dateString) {
    return { valid: false, message: 'Date is required' };
  }
  
  const date = new Date(dateString);
  
  if (isNaN(date.getTime())) {
    return { valid: false, message: 'Invalid date format' };
  }
  
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  
  if (date < oneYearAgo) {
    return { valid: false, message: 'Date cannot be more than 1 year in the past' };
  }
  
  const tenYearsFromNow = new Date();
  tenYearsFromNow.setFullYear(tenYearsFromNow.getFullYear() + 10);
  
  if (date > tenYearsFromNow) {
    return { valid: false, message: 'Date cannot be more than 10 years in the future' };
  }
  
  return { valid: true };
}

module.exports = {
  isValidEmail,
  isValidPassword,
  isValidURL,
  isValidWebhookURL,
  isValidJSON,
  isValidName,
  isValidScheduleName,
  isValidTimezone,
  isValidInterval,
  isValidHTTPMethod,
  isValidFrequency,
  isValidDate,
  sanitizeHTML
};
