document.addEventListener('DOMContentLoaded', initPopup);

// Global variable to store scan results
let currentScanResults = [];

function initPopup() {
  const scanBtn = document.getElementById('scan-btn');
  const downloadBtn = document.getElementById('download-btn');
  const buttonText = scanBtn.querySelector('.button-text');
  const spinner = scanBtn.querySelector('.spinner');
  const scanStatus = document.getElementById('scan-status');
  const resultsDiv = document.getElementById('results');
  const loadingDiv = document.getElementById('loading');

  scanBtn.addEventListener('click', startScan);
  downloadBtn.addEventListener('click', generatePDFReport);

  async function startScan() {
    // Reset UI
    resultsDiv.innerHTML = '';
    scanBtn.disabled = true;
    buttonText.textContent = 'Scanning...';
    spinner.style.display = 'block';
    loadingDiv.style.display = 'block';
    scanStatus.textContent = '';
    downloadBtn.disabled = true;
    
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { action: 'START_SCAN' },
          (response) => {
            if (chrome.runtime.lastError) {
              resolve({ error: chrome.runtime.lastError.message });
            } else {
              resolve(response || { error: 'No response from scanner' });
            }
          }
        );
      });
      
      scanComplete(response.data || [], response.error);
    } catch (error) {
      console.error('Scan failed:', error);
      scanComplete([], error.message || 'Unknown error occurred');
    }
  }

  function scanComplete(results, error = null) {
    // Reset UI state
    scanBtn.disabled = false;
    buttonText.textContent = 'Scan This Page';
    spinner.style.display = 'none';
    loadingDiv.style.display = 'none';

    if (error) {
      showError(error);
      downloadBtn.disabled = true;
      return;
    }

    if (!Array.isArray(results) || results.length === 0) {
      showError('No test results were returned');
      downloadBtn.disabled = true;
      return;
    }

    currentScanResults = results;
    downloadBtn.disabled = false;
    showResults(results);
  }

  function verifyLibrariesLoaded() {
    if (!window.jspdf || !window.html2canvas || !window.Chart) {
      throw new Error(`
        Required libraries not loaded. Please ensure:
        1. jspdf.umd.min.js, html2canvas.min.js, and chart.umd.min.js exist in lib/ folder
        2. Files are properly included in manifest.json
        3. File paths in popup.html are correct
        Current status:
        - jspdf: ${!!window.jspdf}
        - html2canvas: ${!!window.html2canvas}
        - Chart: ${!!window.Chart}
      `);
    }
  }

  async function generatePDFReport() {
    const downloadBtn = document.getElementById('download-btn');
    const buttonText = downloadBtn.querySelector('.button-text');
    
    // Show loading state
    downloadBtn.disabled = true;
    buttonText.textContent = 'Generating...';
    
    const pdfLoading = document.createElement('div');
    pdfLoading.className = 'pdf-loading';
    pdfLoading.innerHTML = `
      <div class="pdf-loading-content">
        <div class="loading-spinner"></div>
        <p>Generating PDF report...</p>
      </div>
    `;
    document.body.appendChild(pdfLoading);

    try {
      // Verify libraries are loaded
      verifyLibrariesLoaded();

      // Generate sanitized HTML first (without charts)
      const htmlContent = generatePDFHTML(sanitizeResults(currentScanResults));
      
      // Create temporary element for the main content
      const tempDiv = document.createElement('div');
      tempDiv.style.position = 'absolute';
      tempDiv.style.left = '-9999px';
      tempDiv.style.width = '700px';
      tempDiv.style.padding = '20px';
      tempDiv.style.background = 'white';
      tempDiv.innerHTML = htmlContent;
      document.body.appendChild(tempDiv);

      // Generate charts after the content is in DOM
      const passed = currentScanResults.filter(r => r?.status === 'pass').length;
      const failed = currentScanResults.filter(r => r?.status === 'fail').length;
      const warnings = currentScanResults.filter(r => r?.status === 'warn').length;
      const na = currentScanResults.filter(r => r?.status === 'na').length;
      const errors = currentScanResults.filter(r => r?.status === 'error').length;
      
      const severities = {
        critical: currentScanResults.filter(r => r?.severity === 'critical').length,
        high: currentScanResults.filter(r => r?.severity === 'high').length,
        medium: currentScanResults.filter(r => r?.severity === 'medium').length,
        low: currentScanResults.filter(r => r?.severity === 'low').length
      };

      // Find the chart containers in the tempDiv
      const resultsCanvas = tempDiv.querySelector('#resultsChart');
      const severityCanvas = tempDiv.querySelector('#severityChart');

      // Render charts directly in the tempDiv
      new Chart(resultsCanvas.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: ['Passed', 'Failed', 'Warnings', 'N/A', 'Errors'],
          datasets: [{
            data: [passed, failed, warnings, na, errors],
            backgroundColor: [
              '#34a853',
              '#ea4335',
              '#fbbc05',
              '#9aa0a6',
              '#b80672'
            ]
          }]
        },
        options: {
          responsive: false,
          plugins: {
            title: {
              display: true,
              text: 'Scan Results by Status'
            }
          }
        }
      });

      new Chart(severityCanvas.getContext('2d'), {
        type: 'bar',
        data: {
          labels: ['Critical', 'High', 'Medium', 'Low'],
          datasets: [{
            label: 'Findings by Severity',
            data: [severities.critical, severities.high, severities.medium, severities.low],
            backgroundColor: [
              '#b80672',
              '#ea4335',
              '#fbbc05',
              '#34a853'
            ]
          }]
        },
        options: {
          responsive: false,
          scales: {
            y: {
              beginAtZero: true
            }
          },
          plugins: {
            title: {
              display: true,
              text: 'Findings by Severity Level'
            }
          }
        }
      });

      // Wait for charts to render
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Generate PDF with all content
      let canvas;
      try {
        canvas = await html2canvas(tempDiv, {
          scale: 2,
          logging: false,
          useCORS: true,
          backgroundColor: '#ffffff'
        });
      } catch (canvasError) {
        throw new Error(`Canvas generation failed: ${canvasError.message}`);
      }

      // Create PDF
      try {
        const pdf = new jspdf.jsPDF('p', 'mm', 'a4');
        const imgData = canvas.toDataURL('image/png');
        const imgWidth = 210; // A4 width in mm
        const pageHeight = 295; // A4 height in mm
        const imgHeight = (canvas.height * imgWidth) / canvas.width;
        
        let heightLeft = imgHeight;
        let position = 0;
        
        // Add first page
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
        
        // Add additional pages if needed
        while (heightLeft >= 0) {
          position = heightLeft - imgHeight;
          pdf.addPage();
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
          heightLeft -= pageHeight;
        }
        
        // Add centered page numbers in footer
        const pageCount = pdf.internal.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
          pdf.setPage(i);
          pdf.setFontSize(10);
          pdf.text(`Page ${i} of ${pageCount}`, pdf.internal.pageSize.width / 2, pdf.internal.pageSize.height - 10, { align: 'center' });
        }
        
        // Download the PDF
        const pdfBlob = pdf.output('blob');
        const pdfUrl = URL.createObjectURL(pdfBlob);
        
        chrome.downloads.download({
          url: pdfUrl,
          filename: `vigilante-security-report-${new Date().toISOString().slice(0,10)}.pdf`,
          conflictAction: 'uniquify',
          saveAs: true
        });
      } catch (pdfError) {
        throw new Error(`PDF creation failed: ${pdfError.message}`);
      }
    } catch (error) {
      console.error('PDF generation failed:', error);
      document.getElementById('scan-status').innerHTML = `
        <span style="color:#d93025">
          PDF generation failed: ${error.message}
          ${error.message.includes('libraries not loaded') ? 
            '<br>Please check the browser console for details' : ''}
        </span>
      `;
    } finally {
      // Clean up
      const tempDiv = document.querySelector('div[style*="left: -9999px"]');
      if (tempDiv) document.body.removeChild(tempDiv);
      
      if (pdfLoading.parentNode) {
        document.body.removeChild(pdfLoading);
      }
      downloadBtn.disabled = false;
      buttonText.textContent = 'Download Report';
    }
  }

  function sanitizeResults(results) {
    return results.map(result => ({
      ...result,
      test: escapeHtml(result.test),
      description: escapeHtml(result.description),
      details: escapeHtml(result.details),
      fix: result.fix ? escapeHtml(result.fix) : null,
      examples: result.examples ? 
        (Array.isArray(result.examples) ? 
          result.examples.map(ex => escapeHtml(ex)) : 
          escapeHtml(result.examples)) : 
        null
    }));
  }

  function escapeHtml(unsafe) {
    if (typeof unsafe !== 'string') return unsafe;
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function generatePDFHTML(results) {
    const passed = results.filter(r => r?.status === 'pass').length;
    const failed = results.filter(r => r?.status === 'fail').length;
    const warnings = results.filter(r => r?.status === 'warn').length;
    const na = results.filter(r => r?.status === 'na').length;
    const errors = results.filter(r => r?.status === 'error').length;
    
    // Severity breakdown
    const severities = {
      critical: results.filter(r => r?.severity === 'critical').length,
      high: results.filter(r => r?.severity === 'high').length,
      medium: results.filter(r => r?.severity === 'medium').length,
      low: results.filter(r => r?.severity === 'low').length
    };
    
    const currentDate = new Date().toLocaleString();
    const currentUrl = results[0]?.url || 'URL not available';
    const riskScore = calculateRiskScore(results);
    const riskLevel = getRiskLevel(riskScore);
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { 
            font-family: Arial, sans-serif; 
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
          }
          .report-header { 
            text-align: center; 
            margin-bottom: 10px;
            border-bottom: 2px solid #6E07F3;
            padding-bottom: 10px;
          }
          h1 { 
            color: #6E07F3; 
            margin-bottom: 5px;
            font-size: 24px;
          }
          .risk-score {
            text-align: center;
            font-size: 20px;
            font-weight: bold;
            margin: 10px 0 15px 0;
            padding: 10px;
            background: linear-gradient(90deg, #f8f9fa, #ffffff, #f8f9fa);
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .risk-score-value {
            font-size: 36px;
            color: #6E07F3;
            margin: 5px 0;
          }
          .risk-level {
            font-size: 16px;
          }
          .charts {
            display: flex;
            flex-wrap: wrap;
            gap: 15px;
            margin: 15px 0;
            justify-content: center;
          }
          .chart-container {
            width: 400px;
            height: 250px;
            background: white;
            padding: 5px;
            border-radius: 8px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          }
          .summary { 
            margin: 15px 0;
            background: #f8f9fa;
            padding: 10px;
            border-radius: 5px;
          }
          .test-result { 
            margin-bottom: 12px; 
            padding: 8px; 
            border-left: 4px solid #ddd;
            page-break-inside: avoid;
          }
          .status-pass { border-left-color: #34a853; }
          .status-fail { border-left-color: #ea4335; }
          .status-warn { border-left-color: #fbbc05; }
          .status-na { border-left-color: #9aa0a6; }
          .status-error { border-left-color: #b80672; }
          .test-header { 
            display: flex; 
            justify-content: space-between;
            margin-bottom: 3px;
          }
          .test-name { 
            font-weight: bold; 
            font-size: 1em;
            color: #202124;
          }
          .test-status {
            font-weight: bold;
            text-transform: uppercase;
            font-size: 0.9em;
          }
          .severity { 
            padding: 2px 6px; 
            border-radius: 3px; 
            font-size: 0.8em;
            font-weight: bold;
            margin-left: 8px;
          }
          .severity-high { background: #ea4335; color: white; }
          .severity-medium { background: #fbbc05; color: black; }
          .severity-low { background: #34a853; color: white; }
          .severity-critical { background: #b80672; color: white; }
          .test-fix { 
            background: #f1f3f4; 
            padding: 8px; 
            margin-top: 8px;
            border-radius: 4px;
            font-size: 0.85em;
          }
          .test-fix strong { color: #202124; }
          .test-description {
            color: #5f6368;
            font-size: 0.85em;
            margin-bottom: 6px;
          }
          .test-details {
            margin: 6px 0;
            font-size: 0.9em;
          }
        </style>
      </head>
      <body>
        <div class="report-header">
          <h1>Vigilante Security Scan Report</h1>
          <p><strong>Generated:</strong> ${currentDate}</p>
          <p><strong>Scanned URL:</strong> ${currentUrl}</p>
        </div>
        
        <div class="risk-score">
          <div>Security Risk Score</div>
          <div class="risk-score-value">${riskScore}/100</div>
          <div class="risk-level">${riskLevel}</div>
        </div>
        
        <div class="charts">
          <div class="chart-container">
            <canvas id="resultsChart" width="400" height="250"></canvas>
          </div>
          <div class="chart-container">
            <canvas id="severityChart" width="400" height="250"></canvas>
          </div>
        </div>
        
        <div class="summary">
          <h2>Scan Summary</h2>
          <p>
            <span style="color:#34a853">✓ ${passed} Passed</span> | 
            <span style="color:#ea4335">✗ ${failed} Failed</span> |
            ${warnings ? `<span style="color:#fbbc05">⚠ ${warnings} Warnings</span> | ` : ''}
            <span style="color:#9aa0a6">○ ${na} N/A</span>
            ${errors ? ` | <span style="color:#b80672">⚠ ${errors} Errors</span>` : ''}
          </p>
        </div>
        
        <div class="results">
          ${results.map(result => `
            <div class="test-result status-${result.status}">
              <div class="test-header">
                <span class="test-name">${result.test}</span>
                <span class="test-status">${result.status.toUpperCase()}</span>
              </div>
              <div class="test-description">${result.description}</div>
              <div class="test-details">
                ${result.details}
                ${result.severity ? `
                  <span class="severity severity-${result.severity}">
                    ${result.severity.toUpperCase()}
                  </span>
                ` : ''}
              </div>
              ${result.fix ? `
                <div class="test-fix">
                  <strong>Recommendation:</strong> ${result.fix}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </body>
      </html>
    `;
  }

  function calculateRiskScore(results) {
    const weights = {
      critical: 5,
      high: 3,
      medium: 2,
      low: 1
    };
    
    let score = 100;
    results.forEach(result => {
      if (result.severity && weights[result.severity] && result.status !== 'pass') {
        score -= weights[result.severity];
      }
    });
    
    return Math.max(0, score);
  }

  function getRiskLevel(score) {
    if (score >= 80) return 'Low Risk';
    if (score >= 50) return 'Medium Risk';
    if (score >= 20) return 'High Risk';
    return 'Critical Risk';
  }

  function showError(error) {
    scanStatus.innerHTML = `<span style="color:#d93025">❌ ${error}</span>`;
    
    resultsDiv.innerHTML = `
      <div class="test-result">
        <div class="test-header">
          <span class="test-name">Scan Failed</span>
          <span class="test-status status-fail">ERROR</span>
        </div>
        <div class="test-details">${error}</div>
        <div class="test-fix">
          <strong>Recommendation:</strong> Try refreshing the page and scanning again.<br>
          If the problem persists, check the browser console for errors.
        </div>
      </div>
    `;
  }

  function showResults(results) {
    const passed = results.filter(r => r?.status === 'pass').length;
    const failed = results.filter(r => r?.status === 'fail').length;
    const warnings = results.filter(r => r?.status === 'warn').length;
    const na = results.filter(r => r?.status === 'na').length;
    const errors = results.filter(r => r?.status === 'error').length;
    const riskScore = calculateRiskScore(results);
    const riskLevel = getRiskLevel(riskScore);

    scanStatus.innerHTML = `
      <div style="margin-bottom: 10px;">
        <span style="font-weight: bold; color: ${getRiskColor(riskScore)};">Security Risk: ${riskScore}/100 (${riskLevel})</span>
      </div>
      <div>
        <span style="color:#137333">✓ ${passed} Passed</span> | 
        <span style="color:#d93025">✗ ${failed} Failed</span> |
        ${warnings ? `<span style="color:#f9ab00">⚠ ${warnings} Warnings</span> | ` : ''}
        <span style="color:#5f6368">○ ${na} N/A</span>
        ${errors ? ` | <span style="color:#b80672">⚠ ${errors} Errors</span>` : ''}
      </div>
    `;

    resultsDiv.innerHTML = results.map(result => {
      const status = result?.status || 'error';
      const details = result?.details || 'No details available';
      const description = result?.description || 'No description available';
      const testName = result?.test || 'Unknown Test';

      return `
        <div class="test-result">
          <div class="test-header">
            <span class="test-name">${testName}</span>
            <span class="test-status status-${status}">
              ${status.toUpperCase()}
            </span>
          </div>
          <div class="test-description">${description}</div>
          <div class="test-details">
            ${details}
            ${result?.severity ? `
              <span class="test-severity severity-${result.severity}">
                ${(result.severity || '').toUpperCase()}
              </span>
            ` : ''}
          </div>
          ${result?.fix ? `
            <div class="test-fix">
              <strong>Recommendation:</strong> ${result.fix}
            </div>
          ` : ''}
          ${result?.reference ? `
            <div class="test-fix">
              <strong>Reference:</strong> <a href="${result.reference}" target="_blank">${result.reference}</a>
            </div>
          ` : ''}
          ${result?.examples ? `
            <div class="test-fix">
              <strong>Examples:</strong><br>
              ${(Array.isArray(result.examples) 
                ? result.examples.slice(0, 3).map(ex => `• ${ex}`).join('<br>') 
                : 'No examples available')}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  function getRiskColor(score) {
    if (score >= 80) return '#34a853';
    if (score >= 50) return '#fbbc05';
    if (score >= 20) return '#ea4335';
    return '#b80672';
  }
}