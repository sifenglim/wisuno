/**
 * Wisuno Domain Redirector
 * Intelligent routing logic
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
	],
	// No timeout needed
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
		// Simulating check
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

	// Start checking all domains in parallel
	CONFIG.domains.forEach((d) => {
		checkDomain(d).then(updateDomainUI);
	});
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

		// Richer status text
		latencyEl.innerHTML = `
            <span style="opacity:0.7; font-size:0.9em; margin-right:8px;">${result.latency}ms</span>
            <span style="color:${color}; font-weight:600;">${text}</span>
        `;

		// Highlight logic could be added here (e.g., if it's the fastest seen so far)
	} else {
		statusEl.style.backgroundColor = '#ef4444'; // Red
		statusEl.style.boxShadow = 'none';

		latencyEl.innerHTML = `<span style="color:#ef4444;">无法连接</span>`;

		if (itemEl) {
			itemEl.style.opacity = '0.5';
			itemEl.style.cursor = 'not-allowed';
			itemEl.onclick = (e) => e.preventDefault(); // Prevent click
		}
	}

	// Check if all finished? (Optional, to hide main status text)
}

function sanitizeId(url) {
	return url.replace(/[^a-z0-9]/gi, '');
}

// Boot
document.addEventListener('DOMContentLoaded', init);
