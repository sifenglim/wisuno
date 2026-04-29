/**
 * Wisuno Domain Redirector
 * Intelligent routing logic - Top 2 Fastest Routes
 */

const CONFIG = {
	domains: [
		{
			url: 'https://wisunoportal.com',
			label: 'wisunoportal.com',
		},
		{
			url: 'https://wisunoit.com',
			label: 'wisunoit.com',
		},
		{
			url: 'https://mywisuno.com',
			label: 'mywisuno.com',
		},
		{
			url: 'https://wisunonet.com',
			label: 'wisunonet.com',
		},
		{
			url: 'https://wisunolab.com',
			label: 'wisunolab.com',
		},
		{
			url: 'https://wisunodev.com',
			label: 'wisunodev.com',
		},
		{url: 'https://wisunohub.com', label: 'wisunohub.com'},
		{url: 'https://wisunoportal1.com', label: 'wisunoportal1.com'},
	],
	// IP 直连，仅在所有域名失败时显示
	ipFallback: {
		url: 'http://54.254.160.211',
		label: '54.254.160.211',
	},
};

const state = {
	redirecting: false,
};

// UI Elements
let loaderContainer;
let domainList;
let statusText;

/**
 * Check connectivity to a single domain
 */
async function checkDomain(domain) {
	const startTime = performance.now();
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), 20000);

	try {
		await fetch(domain.url, {
			method: 'HEAD',
			mode: 'no-cors',
			signal: controller.signal,
			cache: 'no-store',
		});
		clearTimeout(id);
		const endTime = performance.now();
		const latency = Math.round(endTime - startTime);
		return {domain, latency, success: true};
	} catch (error) {
		clearTimeout(id);
		return {domain, error, success: false};
	}
}

/**
 * Initialize
 */
async function init() {
	loaderContainer = document.querySelector('.loader-container');
	domainList = document.querySelector('.domain-list');
	statusText = document.querySelector('.status-text');

	// Fetch Client IP
	const ipInfoEl = document.getElementById('client-ip-info');
	if (ipInfoEl) fetchClientInfo(ipInfoEl);

	// Start all checks in parallel
	const checkPromises = CONFIG.domains.map((d) => checkDomain(d));

	// Wait for all to complete
	const results = await Promise.all(checkPromises);

	// Filter successful and sort by latency
	const successfulResults = results
		.filter((r) => r.success)
		.sort((a, b) => a.latency - b.latency);

	// Take top 2
	const topTwo = successfulResults.slice(0, 2);

	// Hide loading
	if (loaderContainer) loaderContainer.style.display = 'none';

	// Render only top 2
	if (topTwo.length > 0) {
		renderTopDomains(topTwo);

		// Show list
		if (domainList) {
			domainList.style.display = 'flex';
			domainList.classList.add('visible');
		}

		// Auto redirect logic (if enabled)
		if (window.WISUNO_CONFIG?.autoRedirect) {
			handleAutoRedirect(topTwo[0].domain);
		}
	} else {
		// 所有域名失败，尝试 IP 直连
		const ipResult = await checkDomain(CONFIG.ipFallback);
		if (ipResult.success) {
			renderTopDomains([ipResult]);
			if (domainList) {
				domainList.style.display = 'flex';
				domainList.classList.add('visible');
			}
			if (window.WISUNO_CONFIG?.autoRedirect) {
				handleAutoRedirect(CONFIG.ipFallback);
			}
		} else {
			// IP 也失败，显示错误
			if (statusText) statusText.style.display = 'none';
			const errorModule = document.getElementById('error-module');
			if (errorModule) errorModule.style.display = 'flex';
		}
	}
}

function handleAutoRedirect(domain) {
	if (state.redirecting) return;
	state.redirecting = true;

	statusText.textContent = `最优线路: ${domain.label}，正在跳转...`;
	statusText.style.color = 'var(--success-color)';

	// Build Target URL containing path and query
	const path = window.location.pathname;
	const search = window.location.search;
	const hash = window.location.hash;

	// Ensure no double slash if domain ends with / (ours don't)
	const targetUrl = domain.url + path + search + hash;

	setTimeout(() => {
		// Try to open in new tab
		const newWindow = window.open(targetUrl.replace('wisuno/', ''), '_blank');

		if (
			!newWindow ||
			newWindow.closed ||
			typeof newWindow.closed == 'undefined'
		) {
			// Fallback: If blocked, redirect in current window
			window.location.replace(targetUrl);
		} else {
			statusText.textContent = `已在新窗口打开 ${domain.label}`;
			statusText.style.color = '#4ade80';
		}
	}, 2000);
}

function renderTopDomains(topResults) {
	if (!domainList) return;

	domainList.innerHTML = topResults
		.map((result, index) => {
			const d = result.domain;
			const color = getColorForLatency(result.latency);
			const text = getTextForLatency(result.latency);

			return `
        <a href="${d.url}" target="_blank" rel="noopener noreferrer" class="domain-item" id="item-${sanitizeId(d.url)}">
            <div class="domain-info">
                <span class="domain-name">${d.label}</span>
            </div>
            <div class="domain-status-container" style="display:flex;align-items:center;gap:12px;">
                <span class="latency-badge" style="font-size:0.85rem; display:flex; align-items:center;">
                    <span style="opacity:0.7; font-size:0.9em; margin-right:8px;">${result.latency}ms</span>
                    <span style="color:${color}; font-weight:600;">${text}</span>
                </span>
                <div class="domain-status" style="background-color:${color}; box-shadow: 0 0 8px ${color};"></div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3"><path d="M9 18l6-6-6-6"/></svg>
            </div>
        </a>
    `;
		})
		.join('');
}

function getColorForLatency(latency) {
	if (latency <= 500) return '#4ade80'; // Green - Fast
	if (latency <= 1200) return '#facc15'; // Yellow - Good
	if (latency <= 3000) return '#fb923c'; // Orange - Slow
	return '#f87171'; // Red - Poor
}

function getTextForLatency(latency) {
	if (latency <= 500) return '极快';
	if (latency <= 1200) return '良好';
	if (latency <= 3000) return '一般';
	return '拥堵';
}

// ...existing code...
function sanitizeId(url) {
	return url.replace(/[^a-z0-9]/gi, '');
}

async function fetchClientInfo(element) {
	element.textContent = '正在获取客户端信息...';
	try {
		const response = await fetch('https://ipapi.co/json/');
		if (!response.ok) throw new Error('IP API failed');

		const data = await response.json();
		const locationStr = [data.city, data.country_name]
			.filter(Boolean)
			.join(', ');

		// Show IP and Location
		// Using a gentle accent color for the IP to make it stand out slightly
		element.innerHTML = `
            <span style="opacity:0.8;">当前 IP:</span> 
            <span style="color:var(--accent-color); font-family:monospace; font-size:1em;">${data.ip}</span>
            <span style="opacity:0.8;">${locationStr ? `&nbsp;@ ${locationStr}` : ''}</span>
        `;
	} catch (error) {
		console.warn('IP fetch failed:', error);
		element.textContent = ''; // Fail silently
	}
}

// Boot
document.addEventListener('DOMContentLoaded', init);
