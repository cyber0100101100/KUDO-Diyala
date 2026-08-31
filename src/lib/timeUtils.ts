/**
 * Returns the current date and time in Baghdad timezone
 */
export function getBaghdadTime(): Date {
  const now = new Date();
  const baghdadStr = now.toLocaleString('en-US', { timeZone: 'Asia/Baghdad' });
  return new Date(baghdadStr);
}

/**
 * Formats a date into a numeric-only format (YYYY/MM/DD) using Baghdad timezone.
 */
export function formatDateNumeric(date: Date | string | number | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';

  // Use Intl.DateTimeFormat for consistent Baghdad timezone formatting
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const parts = formatter.formatToParts(d);
  const day = parts.find(p => p.type === 'day')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const year = parts.find(p => p.type === 'year')?.value;

  return `${year}/${month}/${day}`;
}

/**
 * Returns the current date in Baghdad as a string (YYYY-MM-DD).
 */
export function getTodayBaghdadStr(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date());
}

/**
 * Returns the current month in Baghdad as a string (YYYY-MM).
 */
export function getCurrentMonthBaghdadStr(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Baghdad',
    year: 'numeric',
    month: '2-digit',
  });
  return formatter.format(new Date());
}

/**
 * Formats a date or time string into a 12-hour format with AM/PM indicators in Arabic,
 * ensuring it uses Baghdad timezone.
 */
export function formatTime12h(date: Date | string | number | undefined): string {
  if (!date) return '';
  
  let d: Date;
  if (typeof date === 'string' && date.includes(':') && !date.includes('-') && !date.includes('T')) {
    // It's likely a "HH:mm" string from a time input
    const [hours, minutes] = date.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'مساءً' : 'صباحاً';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  } else {
    d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
  }
  
  if (isNaN(d.getTime())) return '';

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baghdad',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  const parts = formatter.formatToParts(d);
  const hour = parts.find(p => p.type === 'hour')?.value;
  const minute = parts.find(p => p.type === 'minute')?.value;
  const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value;
  
  const ampm = dayPeriod?.toLowerCase() === 'pm' ? 'مساءً' : 'صباحاً';
  
  return `${hour}:${minute} ${ampm}`;
}

/**
 * Formats a live clock with seconds in 12-hour format for Baghdad timezone.
 */
export function formatLiveClock(date: Date): string {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Baghdad',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const parts = formatter.formatToParts(date);
  const hour = parts.find(p => p.type === 'hour')?.value;
  const minute = parts.find(p => p.type === 'minute')?.value;
  const second = parts.find(p => p.type === 'second')?.value;
  const dayPeriod = parts.find(p => p.type === 'dayPeriod')?.value;
  
  const ampm = dayPeriod?.toLowerCase() === 'pm' ? 'مساءً' : 'صباحاً';
  
  return `${hour}:${minute}:${second} ${ampm}`;
}
