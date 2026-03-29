// src/utils/apiUrl.ts
// Derives the backend API URL from the current page location so that
// the frontend always talks to the same hostname the browser loaded from.
// This avoids cross-site cookie issues when accessed via FQDN or localhost.
export function getApiUrl(): string {
  if (process.env.REACT_APP_API_URL) {
    return process.env.REACT_APP_API_URL;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:3002`;
  }
  return 'http://localhost:3002';
}
