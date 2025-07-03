(function() {
  // Injection guard
  if (window.__VIGILANTE_LOADED__) return;
  window.__VIGILANTE_LOADED__ = true;

  console.log('Vigilante security scanner loaded');

  // Helper function for version comparison
  function versionCompare(v1, v2) {
    const parts1 = v1.split('.').map(Number);
    const parts2 = v2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;
      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }
    return 0;
  }

  // Security test definitions
  const securityTests = [
    // ===== DEPENDENCY SECURITY =====
    {
      name: "jQuery Version",
      description: "Checks for vulnerable jQuery versions",
      run: () => {
        if (!window.jQuery) return { status: "na", details: "jQuery not used" };
        const version = jQuery.fn.jquery;
        const vulnerableVersions = [
          { max: '1.4.4', severity: 'critical' },
          { max: '1.6.4', severity: 'high' },
          { max: '1.9.1', severity: 'medium' },
          { max: '2.2.4', severity: 'medium' }
        ];
        
        const vulnerable = vulnerableVersions.find(v => versionCompare(version, v.max) <= 0);
        if (vulnerable) {
          return {
            status: "fail",
            details: `Vulnerable v${version} (${vulnerable.severity} risk)`,
            severity: vulnerable.severity,
            fix: "Upgrade to jQuery 3.6.0+",
            reference: "https://nvd.nist.gov/vuln/search/results?form_type=Advanced&results_type=overview&search_type=all&cpe_vendor=cpe%3A%2F%3Ajquery&cpe_product=cpe%3A%2F%3Ajquery%3Ajquery"
          };
        }
        return { status: "pass", details: `Secure v${version}` };
      }
    },
    {
      name: "Outdated Libraries",
      description: "Detects known vulnerable library versions",
      run: () => {
        const vulnerableLibs = [];
        
        if (window.React && window.React.version && versionCompare(window.React.version, '16.8.0') < 0) {
          vulnerableLibs.push(`React v${window.React.version}`);
        }
        
        if (window.angular && window.angular.version && versionCompare(window.angular.version.full, '1.8.0') < 0) {
          vulnerableLibs.push(`AngularJS v${window.angular.version.full}`);
        }
        
        return vulnerableLibs.length > 0 ? {
          status: "fail",
          details: `${vulnerableLibs.length} outdated libraries`,
          severity: "high",
          examples: vulnerableLibs,
          fix: "Update to latest stable versions"
        } : { status: "pass", details: "No outdated libraries detected" };
      }
    },

    // ===== NETWORK SECURITY =====
    {
      name: "Mixed Content",
      description: "Detects HTTP resources on HTTPS pages",
      run: () => {
        if (location.protocol !== 'https:') return { status: "na", details: "Page not HTTPS" };
        
        const insecure = performance.getEntries()
          .filter(entry => entry.name.startsWith('http://') && !entry.name.startsWith('http://localhost'));
        
        return insecure.length > 0 ? {
          status: "fail",
          details: `${insecure.length} insecure requests`,
          severity: "high",
          fix: "Use HTTPS for all resources",
          examples: insecure.slice(0, 3).map(i => i.name),
          reference: "https://web.dev/what-is-mixed-content/"
        } : { status: "pass", details: "All resources secure" };
      }
    },
    {
  name: "HSTS Validation",
  description: "Checks for Strict-Transport-Security header",
  run: ({ headers }) => {
    if (headers?.unavailable) return {
      status: "na",
      details: "Header check not available"
    };
    if (!headers) return {
      status: "error",
      details: "Header check failed"
    }; 
    return headers['strict-transport-security'] ? {
      status: "pass",
      details: `HSTS: ${headers['strict-transport-security']}`
    } : {
      status: "fail",
      details: "Missing HSTS header",
      severity: "high",
      fix: "Add Strict-Transport-Security header"
    };
  }
},
    {
      name: "WebSocket Security",
      description: "Checks for insecure WebSocket connections (ws://)",
      run: () => {
        const insecureWS = [...document.scripts]
          .filter(script => /new WebSocket\(['"]ws:/.test(script.textContent));
        
        return insecureWS.length > 0 ? {
          status: "fail",
          details: `${insecureWS.length} insecure WebSocket connections`,
          severity: "critical",
          fix: "Use wss:// for all WebSocket connections"
        } : { status: "pass", details: "No insecure WebSockets" };
      }
    },

    // ===== DATA SECURITY =====
    {
      name: "Cookie Security",
      description: "Checks for Secure/HttpOnly cookie flags",
      run: () => {
        const insecureCookies = document.cookie.split(';')
          .filter(c => !c.includes('Secure') || !c.includes('HttpOnly'));
        
        return insecureCookies.length > 0 ? {
          status: "fail",
          details: `${insecureCookies.length} insecure cookies`,
          severity: "high",
          fix: "Add Secure and HttpOnly flags to cookies",
          examples: insecureCookies.slice(0, 3)
        } : { status: "pass", details: "All cookies secure" };
      }
    },
    {
      name: "Password Fields",
      description: "Checks for insecure password fields",
      run: () => {
        const passwordFields = [...document.querySelectorAll('input[type="password"]')];
        const insecureFields = passwordFields.filter(field => {
          const form = field.closest('form');
          return form && form.action.startsWith('http://');
        });
        
        return insecureFields.length > 0 ? {
          status: "fail",
          details: `${insecureFields.length} password fields submitted over HTTP`,
          severity: "critical",
          fix: "Ensure all forms with password fields use HTTPS",
          examples: insecureFields.slice(0, 3).map(f => f.name || f.id || 'unnamed')
        } : {
          status: passwordFields.length ? "pass" : "na",
          details: passwordFields.length ? 
            `${passwordFields.length} password fields found (all secure)` :
            "No password fields found"
        };
      }
    },
    {
      name: "Password Visibility",
      description: "Checks if passwords are visible in DOM",
      run: () => {
        const visiblePasswords = [...document.querySelectorAll('input[type=password]')]
          .filter(field => field.value.length > 0);
        
        return visiblePasswords.length > 0 ? {
          status: "fail",
          details: `${visiblePasswords.length} password fields with visible values`,
          severity: "high",
          fix: "Ensure passwords aren't pre-filled in HTML"
        } : { status: "pass", details: "No exposed passwords" };
      }
    },
    {
      name: "Password Autocomplete",
      description: "Checks password fields have autocomplete=off",
      run: () => {
        const passwordFields = [...document.querySelectorAll('input[type=password]')]
          .filter(field => field.autocomplete !== 'off');
        
        return passwordFields.length > 0 ? {
          status: "fail",
          details: `${passwordFields.length} password fields allow autocomplete`,
          severity: "medium",
          fix: "Add autocomplete='off' to password fields"
        } : { status: "pass", details: "Password fields secured" };
      }
    },

    // ===== HEADER SECURITY =====
    {
      name: "CSP Header",
      description: "Checks for Content Security Policy",
      run: () => {
        const cspHeader = document.querySelector('meta[http-equiv="Content-Security-Policy"]') ||
                        document.querySelector('meta[http-equiv="Content-Security-Policy-Report-Only"]');
        
        return cspHeader ? { 
          status: "pass", 
          details: "CSP detected",
          policy: cspHeader.content
        } : {
          status: "fail", 
          details: "No CSP header detected",
          severity: "high",
          fix: "Implement Content Security Policy",
          reference: "https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP"
        };
      }
    },
    {
      name: "XSS Protection",
      description: "Checks X-XSS-Protection header",
      run: ({ headers }) => {
        if (!headers) return { status: "error", details: "Header check unavailable" };
        return headers['x-xss-protection'] ? {
          status: headers['x-xss-protection'].includes('mode=block') ? "pass" : "warn",
          details: `XSS Protection: ${headers['x-xss-protection']}`,
          fix: headers['x-xss-protection'].includes('mode=block') ? null : "Set to '1; mode=block'"
        } : {
          status: "fail",
          details: "Missing X-XSS-Protection header",
          severity: "medium",
          fix: "Add 'X-XSS-Protection: 1; mode=block' header"
        };
      }
    },
    {
      name: "Referrer Policy",
      description: "Checks for Referrer-Policy header",
      run: ({ headers }) => {
        if (!headers) return { status: "error", details: "Header check unavailable" };
        return headers['referrer-policy'] ? {
          status: "pass",
          details: `Referrer-Policy: ${headers['referrer-policy']}`
        } : {
          status: "warn",
          details: "Missing Referrer-Policy header",
          severity: "low",
          fix: "Set Referrer-Policy: strict-origin-when-cross-origin"
        };
      }
    },
    {
      name: "Permissions Policy",
      description: "Checks for Permissions-Policy header",
      run: ({ headers }) => {
        if (!headers) return { status: "error", details: "Header check unavailable" };
        return headers['permissions-policy'] ? {
          status: "pass",
          details: `Permissions-Policy: ${headers['permissions-policy']}`
        } : {
          status: "warn",
          details: "Missing Permissions-Policy header",
          severity: "medium",
          fix: "Implement least-privilege permissions policy"
        };
      }
    },
    {
      name: "Clickjacking Protection",
      description: "Checks for X-Frame-Options header",
      run: ({ headers }) => {
        if (!headers) return { status: "error", details: "Header check unavailable" };
        return headers['x-frame-options'] ? {
          status: "pass",
          details: `X-Frame-Options: ${headers['x-frame-options']}`
        } : {
          status: "fail",
          details: "Missing X-Frame-Options header",
          severity: "high",
          fix: "Set X-Frame-Options: DENY or SAMEORIGIN"
        };
      }
    },
    {
      name: "Server Header",
      description: "Checks for Server header disclosure",
      run: ({ headers }) => {
        if (!headers) return { status: "error", details: "Header check unavailable" };
        return headers['server'] ? {
          status: "warn",
          details: `Server header exposed: ${headers['server']}`,
          severity: "low",
          fix: "Remove Server header from responses"
        } : { status: "pass", details: "No Server header exposed" };
      }
    },

    // ===== CONTENT SECURITY =====
    {
      name: "SRI Validation",
      description: "Checks for missing SRI on scripts/styles",
      run: () => {
        const elements = [...document.querySelectorAll('script[src], link[rel=stylesheet][href]')]
          .filter(el => !el.integrity);
        
        return elements.length > 0 ? {
          status: "fail",
          details: `${elements.length} resources without SRI`,
          severity: "medium",
          fix: "Add integrity attributes to external resources",
          reference: "https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity"
        } : { status: "pass", details: "All external resources use SRI" };
      }
    },
    {
      name: "Third-Party Scripts",
      description: "Detects potentially risky third-party scripts",
      run: () => {
        const thirdPartyScripts = [...document.scripts]
          .filter(script => script.src && !script.src.startsWith(location.origin))
          .map(script => new URL(script.src).hostname);
        
        return thirdPartyScripts.length > 0 ? {
          status: "warn",
          details: `${thirdPartyScripts.length} third-party scripts loaded`,
          severity: "low",
          examples: [...new Set(thirdPartyScripts)].slice(0, 5),
          reference: "https://web.dev/third-party-scripts/"
        } : { status: "pass", details: "No third-party scripts detected" };
      }
    },

    // ===== DOCUMENT SECURITY =====
    {
      name: "Document Standards",
      description: "Checks document compatibility mode",
      run: () => {
        const isQuirks = document.compatMode === 'BackCompat';
        return isQuirks ? {
          status: "fail",
          details: "Document in quirks mode",
          severity: "medium",
          fix: "Add proper DOCTYPE declaration",
          reference: "https://developer.mozilla.org/en-US/docs/Web/HTML/Quirks_Mode_and_Standards_Mode"
        } : {
          status: "pass",
          details: `Document mode: ${document.compatMode}`
        };
      }
    },
    {
      name: "document.write() Usage",
      description: "Detects dangerous document.write() calls",
      run: () => {
        const scripts = [...document.scripts]
          .filter(script => script.textContent.includes('document.write('));
        
        return scripts.length > 0 ? {
          status: "fail",
          details: `${scripts.length} scripts use document.write()`,
          severity: "medium",
          fix: "Replace with DOM manipulation methods",
          reference: "https://developer.mozilla.org/en-US/docs/Web/API/Document/write"
        } : { status: "pass", details: "No document.write() usage" };
      }
    },
    {
      name: "Form Action Security",
      description: "Checks form submission targets",
      run: () => {
        const insecureForms = [...document.forms]
          .filter(form => form.action.startsWith('http://'));
        
        return insecureForms.length > 0 ? {
          status: "fail",
          details: `${insecureForms.length} forms submit via HTTP`,
          severity: "high",
          fix: "Use HTTPS for all form actions",
          examples: insecureForms.map(f => f.action).slice(0, 3)
        } : { status: "pass", details: "All forms use secure submission" };
      }
    }
  ];

  const enhancedSecurityTests = [
  // ===== DATA EXFILTRATION TESTS =====
  {
    name: "Hidden Data Collection",
    description: "Detects hidden forms/iframes that might collect data",
    run: () => {
      const hiddenForms = [...document.querySelectorAll('form')]
        .filter(form => {
          const style = window.getComputedStyle(form);
          return style.display === 'none' || style.visibility === 'hidden';
        });
      
      return hiddenForms.length > 0 ? {
        status: "fail",
        details: `${hiddenForms.length} hidden forms detected`,
        severity: "high",
        examples: hiddenForms.slice(0, 3).map(f => f.id || f.name || 'unnamed'),
        fix: "Investigate hidden forms for potential data collection"
      } : { status: "pass", details: "No suspicious hidden forms" };
    }
  },
  {
    name: "Beacon Tracking",
    description: "Checks for navigator.sendBeacon() usage",
    run: () => {
      const scripts = [...document.scripts]
        .filter(script => script.textContent.includes('navigator.sendBeacon('));
      
      return scripts.length > 0 ? {
        status: "warn",
        details: `${scripts.length} scripts use sendBeacon()`,
        severity: "medium",
        fix: "Review beacon destinations for sensitive data",
        reference: "https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon"
      } : { status: "pass", details: "No beacon tracking detected" };
    }
  },
  {
    name: "WebSocket Data Exfiltration",
    description: "Checks for WebSocket connections sending sensitive data",
    run: () => {
      const wsScripts = [...document.scripts]
        .filter(script => {
          return /new WebSocket\(['"][^'"]+['"]\)/.test(script.textContent) && 
                 /\.send\(.*(password|email|credit|card|ssn|personal)/i.test(script.textContent);
        });
      
      return wsScripts.length > 0 ? {
        status: "fail",
        details: `${wsScripts.length} WebSocket connections with potential sensitive data`,
        severity: "critical",
        fix: "Encrypt sensitive data before WebSocket transmission",
        examples: wsScripts.slice(0, 2).map(s => s.src || 'inline script')
      } : { status: "pass", details: "No suspicious WebSocket usage" };
    }
  },

  // ===== NEW SECURITY TESTS =====
  {
    name: "Local Storage Sensitive Data",
    description: "Checks for sensitive data in localStorage",
    run: () => {
      try {
        const sensitiveKeys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (/password|token|auth|secret|credit|card|cvv|ssn/i.test(key)) {
            sensitiveKeys.push(key);
          }
        }
        
        return sensitiveKeys.length > 0 ? {
          status: "fail",
          details: `${sensitiveKeys.length} sensitive items in localStorage`,
          severity: "high",
          examples: sensitiveKeys.slice(0, 3),
          fix: "Remove sensitive data from localStorage, use secure HTTP-only cookies"
        } : { status: "pass", details: "No sensitive data in localStorage" };
      } catch (e) {
        return { status: "error", details: "LocalStorage access denied" };
      }
    }
  },
  {
    name: "Session Storage Sensitive Data",
    description: "Checks for sensitive data in sessionStorage",
    run: () => {
      try {
        const sensitiveKeys = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (/password|token|auth|secret|credit|card|cvv|ssn/i.test(key)) {
            sensitiveKeys.push(key);
          }
        }
        
        return sensitiveKeys.length > 0 ? {
          status: "fail",
          details: `${sensitiveKeys.length} sensitive items in sessionStorage`,
          severity: "high",
          examples: sensitiveKeys.slice(0, 3),
          fix: "Remove sensitive data from sessionStorage, use secure HTTP-only cookies"
        } : { status: "pass", details: "No sensitive data in sessionStorage" };
      } catch (e) {
        return { status: "error", details: "SessionStorage access denied" };
      }
    }
  },
  {
    name: "Browser Fingerprinting",
    description: "Detects common fingerprinting techniques",
    run: () => {
      const fpTechniques = [];
      const scripts = [...document.scripts];
      
      // Check for common fingerprinting libraries
      if (window.Fingerprint2 || window.fpjs || window.ClientJS) {
        fpTechniques.push("Fingerprinting library detected");
      }
      
      // Check for canvas fingerprinting
      const canvasScripts = scripts.filter(s => 
        /canvas.*getContext|toDataURL|measureText|getImageData/i.test(s.textContent))
        .length;
      if (canvasScripts > 0) fpTechniques.push("Canvas fingerprinting detected");
      
      // Check for WebGL fingerprinting
      const webglScripts = scripts.filter(s => 
        /WebGL.*getParameter|getExtension|readPixels/i.test(s.textContent))
        .length;
      if (webglScripts > 0) fpTechniques.push("WebGL fingerprinting detected");
      
      return fpTechniques.length > 0 ? {
        status: "warn",
        details: `${fpTechniques.length} fingerprinting techniques detected`,
        severity: "medium",
        examples: fpTechniques,
        fix: "Consider blocking fingerprinting scripts if not essential",
        reference: "https://coveryourtracks.eff.org/"
      } : { status: "pass", details: "No fingerprinting detected" };
    }
  },
  // Enhanced data stealing detection
{
  name: "Background Data Exfiltration",
  description: "Detects hidden tracking pixels and background data collection",
  run: () => {
    // Check for tracking pixels
    const trackingPixels = [...document.querySelectorAll('img,iframe,script')]
      .filter(el => {
        const src = el.src || el.href || '';
        return (el.offsetWidth <= 1 && el.offsetHeight <= 1) || // 1x1 pixels
               /track|pixel|beacon|analytics|collect/i.test(src);
      });
    
    // Check for suspicious background requests
    const performanceEntries = performance.getEntries()
      .filter(entry => 
        /track|pixel|beacon|analytics|collect|log/i.test(entry.name) &&
        entry.initiatorType !== 'xmlhttprequest' // Already covered by other tests
      );
    
    const totalFindings = trackingPixels.length + performanceEntries.length;
    
    return totalFindings > 0 ? {
      status: "fail",
      details: `${totalFindings} potential data collection mechanisms`,
      severity: "high",
      fix: "Review all tracking pixels and background requests",
      examples: [
        ...trackingPixels.slice(0, 2).map(t => t.src || t.href || 'hidden element'),
        ...performanceEntries.slice(0, 2).map(p => p.name)
      ]
    } : { status: "pass", details: "No obvious data exfiltration detected" };
  }
}
];

// Add these to your existing securityTests array
securityTests.push(...enhancedSecurityTests);

  // Message handler with proper async response
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'RUN_SCAN') {
      Promise.resolve().then(async () => {
        const results = [];

        // Add current URL to results
      const currentUrl = window.location.href;
        
        for (const test of securityTests) {
          try {
            const result = {
              test: test.name,
              description: test.description,
              url: currentUrl,
              ...(await test.run(request))
            };
            results.push(result);
          } catch (e) {
            results.push({
              test: test.name,
              url: currentUrl,
              status: "error",
              details: `Test failed: ${e.message}`
            });
          }
        }
        
        sendResponse(results);
      });

      return true; // Keep message port open
    }
  });
})();