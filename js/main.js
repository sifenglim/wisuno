/**
 * Wisuno Domain Redirector
 * Intelligent routing logic
 */

const CONFIG = {
	domains: [
		{
			url: 'https://mywisuno.com',
			label: 'mywisuno.com',
		},
		{
			url: 'https://wisunoportal.com',
			label: 'wisunoportal.com',
		},
		{
			url: 'https://wisunoit.com',
			label: 'wisunoit.com',
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
	],
};

const state = {
	redirecting: false,
};

// UI Elements
let domainList;
let statusText;

/**
 * Check connectivity to a single domain
 */
async function checkDomain(domain) {
	const startTime = performance.now();
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), 5000);

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
function init() {
	domainList = document.querySelector('.domain-list');
	statusText = document.querySelector('.status-text');

	renderListSkeleton();

	CONFIG.domains.forEach((d) => {
		checkDomain(d).then((res) => {
			updateDomainUI(res);

			// Auto Redirect Logic
			if (res.success && window.WISUNO_CONFIG?.autoRedirect) {
				handleAutoRedirect(res.domain);
			}
		});
	});
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
		const newWindow = window.open(targetUrl, '_blank');

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
	}, 1000);
}

function renderListSkeleton() {
	if (!domainList) return;
	domainList.innerHTML = CONFIG.domains
		.map(
			(d) => `
        <a href="${d.url}" target="_blank" rel="noopener noreferrer" class="domain-item" id="item-${sanitizeId(d.url)}">
            <div class="domain-info">
                <span class="domain-name">${d.label}</span>
            </div>
            <div class="domain-status-container" style="display:flex;align-items:center;gap:12px;">
                <span class="latency-badge" id="latency-${sanitizeId(d.url)}" style="font-size:0.85rem; display:flex; align-items:center;">
                    <span style="opacity:0.5; margin-right:4px;">检测中...</span>
                </span>
                <div class="domain-status" id="status-${sanitizeId(d.url)}" style="background-color:#666;"></div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.3"><path d="M9 18l6-6-6-6"/></svg>
            </div>
        </a>
    `
		)
		.join('');
}

function updateDomainUI(result) {
	const id = sanitizeId(result.domain.url);
	const statusEl = document.getElementById(`status-${id}`);
	const latencyEl = document.getElementById(`latency-${id}`);
	const itemEl = document.getElementById(`item-${id}`);

	if (!statusEl) return;

	if (result.success) {
		let color = '#4ade80'; // Green - Fast
		let text = '极快';

		if (result.latency > 500) {
			color = '#facc15'; // Yellow - Good
			text = '良好';
		}
		if (result.latency > 1200) {
			color = '#fb923c'; // Orange - Slow
			text = '一般';
		}
		if (result.latency > 3000) {
			color = '#f87171'; // Red - Poor
			text = '拥堵';
		}

		statusEl.style.backgroundColor = color;
		statusEl.style.boxShadow = `0 0 8px ${color}`;

		latencyEl.innerHTML = `
            <span style="opacity:0.7; font-size:0.9em; margin-right:8px;">${result.latency}ms</span>
            <span style="color:${color}; font-weight:600;">${text}</span>
        `;
	} else {
		statusEl.style.backgroundColor = '#ef4444'; // Red
		statusEl.style.boxShadow = 'none';

		latencyEl.innerHTML = `<span style="color:#ef4444;">无法连接</span>`;

		if (itemEl) {
			itemEl.style.opacity = '0.5';
			itemEl.style.cursor = 'not-allowed';
			itemEl.onclick = (e) => e.preventDefault();
		}
	}
}

function sanitizeId(url) {
	return url.replace(/[^a-z0-9]/gi, '');
}

// Boot
document.addEventListener('DOMContentLoaded', init);
