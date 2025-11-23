// WebSocket protocol fix for HTTPS proxy
// This script dynamically determines the correct WebSocket protocol
(function() {
  if (window.location.protocol === 'https:') {
    // Override WebSocket to use secure protocol when page is HTTPS
    const OriginalWebSocket = window.WebSocket;
    window.WebSocket = function(url, protocols) {
      // Convert ws:// to wss:// if page is HTTPS
      if (url.startsWith('ws://')) {
        url = url.replace('ws://', 'wss://');
        console.log('WebSocket: Upgraded to secure protocol:', url);
      }
      return new OriginalWebSocket(url, protocols);
    };
    // Copy static properties
    Object.setPrototypeOf(window.WebSocket, OriginalWebSocket);
    window.WebSocket.prototype = OriginalWebSocket.prototype;
    for (let prop in OriginalWebSocket) {
      if (OriginalWebSocket.hasOwnProperty(prop)) {
        window.WebSocket[prop] = OriginalWebSocket[prop];
      }
    }
  }
})();
