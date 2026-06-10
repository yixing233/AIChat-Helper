// ==UserScript==
// @name         DOM Structure Extractor
// @namespace    https://example.com/
// @version      0.1.0
// @description  提取当前网页 DOM 结构（树形 JSON）
// @match        *://*/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const STATE = {
        maxDepth: 6,
        maxChildren: 80,
        textLimit: 80,
        ignoreHidden: true,
        ignoreTags: new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'SVG', 'PATH'])
    };

    function shortText(text, n = 80) {
        const t = String(text || '').replace(/\s+/g, ' ').trim();
        if (!t) return '';
        return t.length > n ? `${t.slice(0, n)}...` : t;
    }

    function isVisible(el) {
        if (!(el instanceof Element)) return false;
        const style = window.getComputedStyle(el);
        if (!style) return true;
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        return true;
    }

    function pickNodeText(el) {
        const directText = Array.from(el.childNodes || [])
            .filter((n) => n && n.nodeType === Node.TEXT_NODE)
            .map((n) => n.textContent || '')
            .join(' ');
        const t = shortText(directText, STATE.textLimit);
        if (t) return t;
        return shortText(el.innerText || '', STATE.textLimit);
    }

    function buildDomTree(el, depth = 0) {
        if (!(el instanceof Element)) return null;
        if (depth > STATE.maxDepth) return null;
        if (STATE.ignoreTags.has(el.tagName)) return null;
        if (STATE.ignoreHidden && !isVisible(el)) return null;

        const attrs = {};
        const id = String(el.id || '').trim();
        const cls = String(el.className || '').trim().replace(/\s+/g, ' ');
        if (id) attrs.id = id;
        if (cls) attrs.class = cls;
        const role = String(el.getAttribute('role') || '').trim();
        if (role) attrs.role = role;
        const testId = String(el.getAttribute('data-testid') || '').trim();
        if (testId) attrs['data-testid'] = testId;

        const children = [];
        const childEls = Array.from(el.children || []).slice(0, STATE.maxChildren);
        for (const child of childEls) {
            const c = buildDomTree(child, depth + 1);
            if (c) children.push(c);
        }

        return {
            tag: el.tagName.toLowerCase(),
            attrs,
            text: pickNodeText(el),
            childCount: el.children ? el.children.length : 0,
            children
        };
    }

    function extractDomStructure() {
        const root = document.body || document.documentElement;
        const tree = buildDomTree(root, 0);
        return {
            url: window.location.href,
            title: document.title,
            extractedAt: new Date().toISOString(),
            options: {
                maxDepth: STATE.maxDepth,
                maxChildren: STATE.maxChildren,
                textLimit: STATE.textLimit,
                ignoreHidden: STATE.ignoreHidden
            },
            tree
        };
    }

    function copyText(text) {
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text, 'text');
            return;
        }
        navigator.clipboard?.writeText(text).catch(() => {});
    }

    function installPanel() {
        if (document.getElementById('dom-structure-extractor-panel')) return;

        const panel = document.createElement('div');
        panel.id = 'dom-structure-extractor-panel';
        panel.style.cssText = [
            'position:fixed', 'right:16px', 'bottom:16px', 'z-index:2147483647',
            'padding:10px', 'border-radius:10px', 'background:#0f172a', 'color:#e2e8f0',
            'box-shadow:0 8px 24px rgba(0,0,0,.28)',
            'font:12px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
            'display:flex', 'align-items:center', 'gap:8px'
        ].join(';');

        const runBtn = document.createElement('button');
        runBtn.textContent = '提取DOM';
        runBtn.style.cssText = 'border:1px solid #334155;background:#2563eb;color:#fff;border-radius:8px;padding:6px 10px;cursor:pointer;';

        const copyBtn = document.createElement('button');
        copyBtn.textContent = '复制JSON';
        copyBtn.style.cssText = 'border:1px solid #334155;background:#0b1220;color:#e2e8f0;border-radius:8px;padding:6px 10px;cursor:pointer;';

        const status = document.createElement('span');
        status.textContent = 'ready';
        status.style.opacity = '0.85';

        runBtn.addEventListener('click', () => {
            try {
                const data = extractDomStructure();
                const json = JSON.stringify(data, null, 2);
                window.__DOM_STRUCTURE_EXTRACTOR_LAST_JSON__ = json;
                console.log('[DOM-Extractor] 提取结果:', data);
                status.textContent = `ok (${json.length} chars)`;
            } catch (e) {
                console.warn('[DOM-Extractor] 提取失败', e);
                status.textContent = 'error';
            }
        });

        copyBtn.addEventListener('click', () => {
            const json = String(window.__DOM_STRUCTURE_EXTRACTOR_LAST_JSON__ || '').trim();
            if (!json) {
                status.textContent = '先提取';
                return;
            }
            copyText(json);
            status.textContent = '已复制';
        });

        panel.appendChild(runBtn);
        panel.appendChild(copyBtn);
        panel.appendChild(status);
        document.body.appendChild(panel);
    }

    installPanel();
})();

