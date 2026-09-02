/**
 * Wisuno Domain Redirector
 *
 * autoRedirect 由页面注入 window.WISUNO_CONFIG 控制：
 *
 * 【autoRedirect: true】index.html — 智能跳转
 *   test.wisuno.me → 固定跳转 test.wisunoportal.com（保留 path/search/hash）
 *   其他域名 → Cookie 优先 → IP 地理判断 → 域名测速 → 自动 replace 跳转
 *
 * 【autoRedirect: false】gateway.html — 线路选择门户
 *   跳过 Cookie / Geo 选路 → 仅并行探测国内域名 → 展示最快 2 条供手动点击
 */

/** 根据浏览器语言返回 'zh-cn' 或 'en' */
function detectLocale() {
	const lang = (
		navigator.language ||
		navigator.userLanguage ||
		'en'
	).toLowerCase();
	return lang.startsWith('zh') ? 'zh-cn' : 'en';
}

/** 当前页面语言，由 detectLocale 决定 */
const LOCALE = detectLocale();

/** 中英文文案表，key 对应 t() 查找键 */
const MESSAGES = {
	en: {
		tryIpFallback: 'Trying IP fallback...',
		probeDomestic: 'Probing domestic routes...',
		checkInternational: 'Checking international route...',
		probeAll: 'Probing all available routes...',
		verifySaved: 'Verifying saved optimal route...',
		detectLocation: 'Detecting network location...',
		currentIp: 'Current IP:',
		redirecting: 'Best route: {label}, redirecting...',
		latencyFast: 'Fast',
		latencyGood: 'Good',
		latencyFair: 'Fair',
		latencySlow: 'Slow',
	},
	'zh-cn': {
		tryIpFallback: '正在尝试备用 IP 直连...',
		probeDomestic: '正在并行检测国内备用线路...',
		checkInternational: '正在检测国际线路...',
		probeAll: '正在检测全部可用线路...',
		verifySaved: '正在验证历史最优线路...',
		detectLocation: '正在判断网络归属地...',
		currentIp: '当前 IP:',
		redirecting: '最优线路: {label}，正在跳转...',
		latencyFast: '极快',
		latencyGood: '良好',
		latencyFair: '一般',
		latencySlow: '拥堵',
	},
};

/** 按 LOCALE 取文案，支持 {var} 占位符替换 */
function t(key, vars = {}) {
	let str = MESSAGES[LOCALE]?.[key] ?? MESSAGES.en[key] ?? key;
	return str.replace(/\{(\w+)\}/g, (_, name) => vars[name] ?? '');
}

/** 扫描 HTML 中带 en/zh-cn 属性的元素，写入对应语言文本 */
function applyPageI18n() {
	document.documentElement.lang = LOCALE === 'zh-cn' ? 'zh-CN' : 'en';

	document.querySelectorAll('[en]').forEach((el) => {
		const text = el.getAttribute(LOCALE) ?? el.getAttribute('en');
		if (!text) return;

		const tag = el.tagName;
		if (tag === 'META') {
			el.setAttribute('content', text);
		} else if (tag === 'TITLE') {
			el.textContent = text;
		} else {
			el.textContent = text;
		}
	});
}

/** 域名列表、测速阈值、Cookie 名、IP 兜底等全局配置 */
const CONFIG = {
	domesticDomains: [
		{url: 'https://wisunonet1.com', label: 'wisunonet1.com'},
		{url: 'https://siruiit.com', label: 'siruiit.com'},
		{url: 'https://mywisuno1.com', label: 'mywisuno1.com'},
		{url: 'https://wisunoportal1.com', label: 'wisunoportal1.com'},
		{url: 'https://wisuno.biz', label: 'wisuno.biz'},
		{url: 'https://wisunoit.com', label: 'wisunoit.com'},
		{url: 'https://mywisuno.com', label: 'mywisuno.com'},
		{url: 'https://wisunonet.com', label: 'wisunonet.com'},
		{url: 'https://wisunolab.com', label: 'wisunolab.com'},
		{url: 'https://wisunodev.com', label: 'wisunodev.com'},
		{url: 'https://wisunohub.com', label: 'wisunohub.com'},
	],
	internationalDomain: {
		url: 'https://wisunoportal.com',
		label: 'wisunoportal.com',
	},
	speedThreshold: 3000,
	cookieName: 'wisuno_best_domain',
	cookieMaxAge: 7 * 24 * 60 * 60,
	ipFallback: {
		url: 'http://54.254.160.211',
		label: '54.254.160.211',
	},
	/** test.wisuno.me 专用：跳过测速，固定跳转测试门户 */
	testRedirect: {
		host: 'test.wisuno.me',
		url: 'https://test.wisunoportal.com',
		label: 'test.wisunoportal.com',
	},
};

/** 运行时状态；redirecting 防止 handleAutoRedirect 重复触发 */
const state = {
	redirecting: false,
};

/** DOM 引用，init 时绑定 */
let loaderContainer;
let domainList;
let statusText;

/** 读取 WISUNO_CONFIG.autoRedirect，默认 false */
function isAutoRedirect() {
	return Boolean(window.WISUNO_CONFIG?.autoRedirect);
}

/** 当前是否为 test.wisuno.me 测试入口 */
function isTestHost() {
	return window.location.hostname === CONFIG.testRedirect.host;
}

/** 国内 + 国际全部候选域名；仅 autoRedirect true 选路流程使用 */
function getAllDomains() {
	return [...CONFIG.domesticDomains, CONFIG.internationalDomain];
}

/** 按 URL 在候选列表中查找域名对象；仅 autoRedirect true Cookie 校验使用 */
function findDomainByUrl(url) {
	const normalized = url.replace(/\/$/, '');
	return getAllDomains().find(
		(d) => d.url === url || d.url.replace(/\/$/, '') === normalized
	);
}

/** 读取 Cookie 中记录的最优域名 URL；仅 autoRedirect true */
function getCookieDomain() {
	const prefix = `${CONFIG.cookieName}=`;
	const match = document.cookie
		.split(';')
		.map((c) => c.trim())
		.find((c) => c.startsWith(prefix));
	return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

/** 写入最优域名到 Cookie；仅 autoRedirect true 测速成功后调用 */
function setCookieDomain(url) {
	document.cookie = `${CONFIG.cookieName}=${encodeURIComponent(url)}; max-age=${CONFIG.cookieMaxAge}; path=/; SameSite=Lax`;
}

/** 清除最优域名 Cookie；仅 autoRedirect true Cookie 失效时调用 */
function clearCookieDomain() {
	document.cookie = `${CONFIG.cookieName}=; max-age=0; path=/`;
}

/** 判断单次测速结果是否仍可用（延迟 ≤ speedThreshold）；仅 autoRedirect true Cookie 验证 */
function isSpeedAcceptable(result) {
	return result.success && result.latency <= CONFIG.speedThreshold;
}

/** 更新页面底部状态文案 */
function updateStatus(text) {
	if (statusText) statusText.textContent = text;
}

/** 对单个域名发 HEAD 请求测延迟，20s 超时；成功返回 { domain, latency, success } */
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
		const latency = Math.round(performance.now() - startTime);
		return {domain, latency, success: true};
	} catch (error) {
		clearTimeout(id);
		return {domain, error, success: false};
	}
}

/** 并行探测多个域名，过滤失败项，按延迟升序排列 */
async function probeDomains(domains) {
	const results = await Promise.all(domains.map((d) => checkDomain(d)));
	return results.filter((r) => r.success).sort((a, b) => a.latency - b.latency);
}

/** 请求 /api/geo 获取客户端 IP 归属地；失败返回 null */
async function fetchClientGeo() {
	try {
		const response = await fetch('/api/geo', {cache: 'no-store'});
		if (!response.ok) throw new Error('IP API failed');
		return await response.json();
	} catch (error) {
		console.warn('IP fetch failed:', error);
		return null;
	}
}

/** 判断 geo 是否为中国大陆 IP；仅 autoRedirect true 选路使用 */
function isDomesticIp(geo) {
	return geo?.country_code === 'CN';
}

/** 在 footer #client-ip-info 展示 IP 与城市/国家 */
function displayIpInfo(element, geo) {
	if (!element) return;

	if (!geo) {
		element.textContent = '';
		return;
	}

	const locationStr = [geo.city, geo.country_name].filter(Boolean).join(', ');
	element.innerHTML = `
		<span style="opacity:0.8;">${t('currentIp')}</span>
		<span style="color:var(--accent-color); font-family:monospace; font-size:1em;">${geo.ip}</span>
		<span style="opacity:0.8;">${locationStr ? `&nbsp;@ ${locationStr}` : ''}</span>
	`;
}

/**
 * 展示测速结果：隐藏 loader、渲染域名列表
 * autoRedirect true  → 额外调用 handleAutoRedirect 跳转第一名
 * autoRedirect false → 仅展示列表，用户手动点击
 */
function showResults(topResults) {
	if (loaderContainer) loaderContainer.style.display = 'none';

	if (topResults.length > 0) {
		renderTopDomains(topResults);
		if (domainList) {
			domainList.style.display = 'flex';
			domainList.classList.add('visible');
		}
		if (isAutoRedirect()) {
			handleAutoRedirect(topResults[0].domain);
		}
		return true;
	}

	if (statusText) statusText.style.display = 'none';
	const errorModule = document.getElementById('error-module');
	if (errorModule) errorModule.style.display = 'flex';
	return false;
}

/** IP 直连兜底；仅 autoRedirect true，全部域名探测失败时调用 */
async function tryIpFallback() {
	updateStatus(t('tryIpFallback'));
	const ipResult = await checkDomain(CONFIG.ipFallback);
	if (ipResult.success) {
		return showResults([ipResult]);
	}
	return showResults([]);
}

/**
 * 按 IP 归属地选路并测速；仅 autoRedirect true
 * 国内 → 探测 domesticDomains；国外 → internationalDomain
 * geo 未知 → 探测全部；仍失败 → tryIpFallback
 * 成功后写入 Cookie
 */
async function selectByGeo(geo) {
	if (isDomesticIp(geo)) {
		updateStatus(t('probeDomestic'));
		const results = await probeDomains(CONFIG.domesticDomains);
		if (results.length > 0) {
			setCookieDomain(results[0].domain.url);
			return showResults(results.slice(0, 2));
		}
	} else {
		updateStatus(t('checkInternational'));
		const result = await checkDomain(CONFIG.internationalDomain);
		if (result.success) {
			setCookieDomain(result.domain.url);
			return showResults([result]);
		}
	}

	if (!geo) {
		updateStatus(t('probeAll'));
		const results = await probeDomains(getAllDomains());
		if (results.length > 0) {
			setCookieDomain(results[0].domain.url);
			return showResults(results.slice(0, 2));
		}
	}

	return tryIpFallback();
}

/**
 * gateway 入口；autoRedirect false
 * 不涉及 Cookie / Geo 选路，仅并行探测国内域名，展示最快的 2 条
 */
async function initGateway() {
	updateStatus(t('probeDomestic'));
	const results = await probeDomains(CONFIG.domesticDomains);
	return showResults(results.slice(0, 2));
}

/**
 * index 入口；autoRedirect true
 * 1. Cookie 命中且延迟合格 → 直接 showResults
 * 2. 否则 Geo 判断 → selectByGeo 测速选路
 */
async function initRedirector() {
	const savedUrl = getCookieDomain();
	if (savedUrl) {
		const savedDomain = findDomainByUrl(savedUrl);
		if (savedDomain) {
			updateStatus(t('verifySaved'));
			const result = await checkDomain(savedDomain);

			if (isSpeedAcceptable(result)) {
				return showResults([result]);
			}

			clearCookieDomain();
		} else {
			clearCookieDomain();
		}
	}

	updateStatus(t('detectLocation'));
	const geo = await fetchClientGeo();
	return selectByGeo(geo);
}

/** 主入口：绑定 DOM，展示 IP 信息，按 autoRedirect 分流到 initGateway / initRedirector */
async function init() {
	loaderContainer = document.querySelector('.loader-container');
	domainList = document.querySelector('.domain-list');
	statusText = document.querySelector('.status-text');

	const ipInfoEl = document.getElementById('client-ip-info');
	if (ipInfoEl) {
		fetchClientGeo().then((geo) => displayIpInfo(ipInfoEl, geo));
	}

	if (isAutoRedirect()) {
		// test.wisuno.me 跳过 Cookie / Geo / 测速，固定跳转测试门户
		if (isTestHost()) {
			handleAutoRedirect(CONFIG.testRedirect);
			return;
		}
		return initRedirector();
	}
	return initGateway();
}

/** 自动跳转到目标域名，保留 path / search / hash；仅 autoRedirect true */
function handleAutoRedirect(domain) {
	if (state.redirecting) return;
	state.redirecting = true;

	statusText.textContent = t('redirecting', {label: domain.label});
	statusText.style.color = 'var(--success-color)';

	const path = window.location.pathname;
	const search = window.location.search;
	const hash = window.location.hash;
	const targetUrl = domain.url + path + search + hash;

	setTimeout(() => {
		window.location.replace(targetUrl);
	}, 0);
}

/** 将测速结果渲染为 .domain-list 内的可点击卡片（target="_blank"） */
function renderTopDomains(topResults) {
	if (!domainList) return;

	domainList.innerHTML = topResults
		.map((result) => {
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

/** 按延迟毫秒数返回状态色（绿/黄/橙/红） */
function getColorForLatency(latency) {
	if (latency <= 500) return '#4ade80';
	if (latency <= 1200) return '#facc15';
	if (latency <= 3000) return '#fb923c';
	return '#f87171';
}

/** 按延迟毫秒数返回本地化等级文案 */
function getTextForLatency(latency) {
	if (latency <= 500) return t('latencyFast');
	if (latency <= 1200) return t('latencyGood');
	if (latency <= 3000) return t('latencyFair');
	return t('latencySlow');
}

/** 将 URL 转为可作 DOM id 的安全字符串 */
function sanitizeId(url) {
	return url.replace(/[^a-z0-9]/gi, '');
}

document.addEventListener('DOMContentLoaded', () => {
	applyPageI18n();
	init();
});
