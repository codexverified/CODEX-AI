'use strict';

const { create, all } = require('mathjs');
const { sendRichHtml } = require('../../lib/genaiRich');

const math = create(all, {});
const scope = { pi: Math.PI, e: Math.E, tau: Math.PI * 2, phi: (1 + Math.sqrt(5)) / 2 };

function calculatorHtml(expression = '', result = '') {
    const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const keys = ['sin', 'cos', 'tan', 'log', 'ln', 'sqrt', '(', ')', '⌫', '7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '=', '+'];
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:7px;background:#07111f;color:#e8f1ff;font:13px Arial}.card{max-width:440px;margin:auto;padding:14px;border:1px solid #38bdf8;border-radius:22px;background:linear-gradient(145deg,#0e2238,#102d49);box-shadow:0 10px 30px #0008}.title{color:#7dd3fc;text-align:center;font:bold 21px Arial Black;letter-spacing:1px}.sub{text-align:center;color:#94a3b8;font:10px monospace;margin:4px 0 12px}.display{padding:12px;border:1px solid #256b91;border-radius:12px;background:#06101c;min-height:72px;text-align:right;overflow-wrap:anywhere}.expr{color:#94a3b8;font:12px monospace}.result{margin-top:6px;color:#d9f99d;font:bold 22px monospace}.keys{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:10px}.key{padding:11px 4px;border:1px solid #245b7c;border-radius:9px;background:#102b43;color:#dff5ff;text-align:center;font-weight:bold}.key:nth-child(4n),.key:last-child{color:#7dd3fc}.history{margin-top:11px;padding:8px;border-radius:9px;background:#081a2b;color:#9fb6c9;font:10px monospace;white-space:pre-wrap}.hint{margin-top:10px;color:#7c94a7;font:10px monospace;text-align:center}</style></head><body><main class="card"><div class="title">SCIENTIFIC CALCULATOR</div><div class="sub">SAFE MATH ENGINE · RADIAN MODE · π e τ φ</div><section class="display"><div class="expr">${esc(expression || 'Ready for an expression')}</div><div class="result">${esc(result || '0')}</div></section><div class="keys">${keys.map(k => `<div class="key">${esc(k)}</div>`).join('')}</div><div class="history">Functions: sin cos tan asin acos atan sinh cosh tanh log ln sqrt abs floor ceil round\nConstants: pi e tau phi · Operators: ^ % * / + -\nText mode: .calc sin(pi/2) · .calc 2^10 · .calc sqrt(144)</div><div class="hint">Tap keys in supported WhatsApp clients · text mode works everywhere</div></main></body></html>`;
}

module.exports = {
    name: 'calc',
    aliases: ['calculate', 'scientific', 'scicalc'],
    category: 'tools',
    description: 'Visual scientific calculator with safe expression evaluation',
    async execute({ sock, msg, from, reply, args = [] }) {
        const expression = args.join(' ').trim();
        if (!expression) return sendRichHtml({ sock, jid: from, quoted: msg, html: calculatorHtml() });
        try {
            if (expression.length > 180 || /;|\{|\}|\[|\]|function|import|createUnit/i.test(expression)) throw new Error('Unsupported expression');
            const value = math.evaluate(expression, { ...scope });
            if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Result is not finite');
            return sendRichHtml({ sock, jid: from, quoted: msg, html: calculatorHtml(expression, Number(value.toPrecision(12)).toString()) });
        } catch {
            return reply(`Invalid expression. Try: .calc sqrt(144) or .calc sin(pi/2)`);
        }
    },
};

module.exports.calculatorHtml = calculatorHtml;
