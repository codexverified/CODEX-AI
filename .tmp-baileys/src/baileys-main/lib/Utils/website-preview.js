const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

const validateUrl = (value) => {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new TypeError('only HTTP(S) preview URLs are supported');
    return parsed;
};

export const generateLinkPreviewHtml = (url, options = {}) => {
    const parsed = validateUrl(url);
    const title = options.title || parsed.hostname;
    const description = options.description || `Open ${parsed.hostname}`;
    const image = options.image ? `<img src="${escapeHtml(options.image)}" alt="" loading="lazy">` : '<div class="placeholder">🌐</div>';
    return `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:0;background:transparent;font:14px system-ui,sans-serif}.card{overflow:hidden;border:1px solid #333;border-radius:12px;background:#1a1a2e;color:#fff}.card img,.placeholder{display:block;width:100%;height:160px;object-fit:cover}.placeholder{display:grid;place-items:center;font-size:48px;background:linear-gradient(135deg,#1a1a2e,#2d2d44)}.body{padding:14px}.title{font-weight:700;margin-bottom:5px}.desc{color:#bbb;line-height:1.4}.url{margin-top:8px;color:#55c878;font-size:11px}</style></head><body><a href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener noreferrer" style="text-decoration:none"><div class="card">${image}<div class="body"><div class="title">${escapeHtml(title)}</div><div class="desc">${escapeHtml(description)}</div><div class="url">${escapeHtml(parsed.hostname)}</div></div></div></a></body></html>`;
};

export const generateWebsitePreviewHtml = async (url, options = {}) => {
    const parsed = validateUrl(url);
    const response = await (options.fetch || globalThis.fetch)(parsed.href, { signal: options.signal, headers: options.headers || {} });
    if (!response?.ok) throw new Error(`website preview request failed with status ${response?.status ?? 'unknown'}`);
    const html = await response.text();
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] || parsed.hostname;
    const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || `Preview of ${parsed.hostname}`;
    return generateLinkPreviewHtml(parsed.href, { ...options, title, description });
};

export default generateWebsitePreviewHtml;
