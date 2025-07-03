const activeScans = new Map();

// Robust header fetching with multiple fallbacks
async function fetchSecurityHeaders(tabId) {
  // Method 1: Try webRequest API first
  if (chrome.webRequest?.onHeadersReceived) {
    try {
      const headers = await new Promise((resolve) => {
        const handler = (details) => {
          chrome.webRequest.onHeadersReceived.removeListener(handler);
          resolve(details.responseHeaders);
        };

        chrome.webRequest.onHeadersReceived.addListener(
          handler,
          { urls: ["<all_urls>"], tabId },
          ['responseHeaders']
        );

        setTimeout(() => {
          chrome.webRequest.onHeadersReceived.removeListener(handler);
          resolve(null);
        }, 2000);
      });

      if (headers) {
        const headerMap = {};
        headers.forEach(header => {
          headerMap[header.name.toLowerCase()] = header.value;
        });
        return headerMap;
      }
    } catch (e) {
      console.log('webRequest failed:', e);
    }
  }

  // Method 2: Try debugger API as fallback
  if (chrome.debugger?.attach) {
    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      const headers = await new Promise((resolve) => {
        chrome.debugger.sendCommand({ tabId }, 'Network.enable');
        
        const handler = (source, method, params) => {
          if (method === 'Network.responseReceived') {
            chrome.debugger.onEvent.removeListener(handler);
            resolve(params.response.headers);
          }
        };

        chrome.debugger.onEvent.addListener(handler);
        
        setTimeout(() => {
          chrome.debugger.onEvent.removeListener(handler);
          resolve(null);
        }, 2000);
      });

      await chrome.debugger.detach({ tabId });
      return headers;
    } catch (e) {
      console.log('Debugger failed:', e);
    }
  }

  // Method 3: Final fallback - fetch from content script
  return null;
}

// Main message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'START_SCAN') {
    (async () => {
      try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tabs[0]?.id) {
          sendResponse({ error: 'No active tab found' });
          return;
        }

        const tab = tabs[0];
        activeScans.set(tab.id, sendResponse);

        // Set scanning icon
        await chrome.action.setIcon({
          tabId: tab.id,
          path: {
            "16": "/icons/icon16-scanning.png",
            "48": "/icons/icon48-scanning.png"
          }
        });

        // Fetch headers
        const headers = await fetchSecurityHeaders(tab.id);

        // Execute content script
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['src/content/content.js']
        });

        // Send scan command
        chrome.tabs.sendMessage(
          tab.id,
          { 
            action: 'RUN_SCAN',
            headers: headers || { unavailable: true },
            url: tab.url  // Pass the tab URL
          },
          (response) => {
            completeScan(tab.id, { data: response });
          }
        );

        // Set timeout
        setTimeout(() => {
          if (activeScans.has(tab.id)) {
            completeScan(tab.id, { error: 'Scan timed out' });
          }
        }, 30000);

      } catch (err) {
        console.error('Scan failed:', err);
        completeScan(sender.tab?.id, { error: err.message });
      }
    })();

    return true; // Keep message port open
  }
});

function completeScan(tabId, response) {
  const sendResponse = activeScans.get(tabId);
  if (sendResponse) {
    sendResponse(response);
    activeScans.delete(tabId);
  }
  resetIcon(tabId);
}

async function resetIcon(tabId) {
  try {
    await chrome.action.setIcon({
      tabId,
      path: {
        "16": "/icons/icon16.png",
        "48": "/icons/icon48.png"
      }
    });
  } catch (err) {
    console.error('Failed to reset icon:', err);
  }
}