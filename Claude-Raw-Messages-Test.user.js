// ==UserScript==
// @name         Claude Raw Messages Test
// @namespace    https://example.com/
// @version      0.1.0
// @description  Claude 原始消息抓取测试：获取当前会话 chat_conversations 原始 JSON，便于各类消息结构适配
// @match        *://claude.ai/chat/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const host = String(window.location.hostname || '');
    const path = String(window.location.pathname || '');
    const isClaude = /^claude\.ai$/i.test(host) && /^\/chat(?:\/[0-9a-f-]{36})?\/?$/i.test(path);
    if (!isClaude) return;

    const STATE = {
        captureInstalled: false,
        capturedHeaders: {},
        panel: null,
        statusEl: null,
        outputEl: null,
        convMetaEl: null,
        autoRefresh: false,
        autoTimer: 0,
        lastJson: null,
        lastJsonText: '',
        lastFetchedAt: 0
    };

    const CONV_PATH_RE = /\/api\/organizations\/([0-9a-f-]{36})\/chat_conversations\/([0-9a-f-]{36})/i;
    const CONV_LIST_PATH_RE = /\/api\/organizations\/([0-9a-f-]{36})\/chat_conversations_v2/i;

    const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));

    function parseHeadersObject(input) {
        if (!input) return {};
        const out = {};
        if (input instanceof Headers) {
            input.forEach((v, k) => out[String(k).toLowerCase()] = String(v));
            return out;
        }
        if (Array.isArray(input)) {
            input.forEach((pair) => {
                if (!Array.isArray(pair) || pair.length < 2) return;
                out[String(pair[0]).toLowerCase()] = String(pair[1]);
            });
            return out;
        }
        if (typeof input === 'object') {
            Object.entries(input).forEach(([k, v]) => out[String(k).toLowerCase()] = String(v));
        }
        return out;
    }

    function sanitizeHeaders(inputHeaders) {
        const blocked = new Set([
            'cookie', 'host', 'origin', 'referer', 'content-length',
            'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest',
            'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
            'accept-encoding', 'connection', ':authority', ':method', ':path', ':scheme'
        ]);
        const out = {};
        Object.entries(inputHeaders || {}).forEach(([k, v]) => {
            const key = String(k).toLowerCase();
            if (blocked.has(key)) return;
            if (v == null || v === '') return;
            out[key] = String(v);
        });
        return out;
    }

    function getConversationIdFromUrl() {
        const m = String(window.location.pathname || '').match(/^\/chat\/([0-9a-f-]{36})\/?$/i);
        return m ? String(m[1] || '').trim() : '';
    }

    function getOrgIdFromCookie() {
        const raw = String(document.cookie || '');
        const m = raw.match(/(?:^|;\s*)lastActiveOrg=([0-9a-f-]{36})(?:;|$)/i);
        return m && m[1] ? String(m[1]).trim() : '';
    }

    function parseClaudeApiMeta(rawUrl) {
        try {
            const u = new URL(rawUrl, window.location.origin);
            const m = u.pathname.match(CONV_PATH_RE);
            if (!m) return null;
            return { orgId: String(m[1] || '').trim(), convId: String(m[2] || '').trim() };
        } catch (_) {
            return null;
        }
    }

    function isConversationUrl(rawUrl) {
        try {
            const u = new URL(rawUrl, window.location.origin);
            return CONV_PATH_RE.test(u.pathname);
        } catch (_) {
            return false;
        }
    }

    function isConversationListUrl(rawUrl) {
        try {
            const u = new URL(rawUrl, window.location.origin);
            return CONV_LIST_PATH_RE.test(u.pathname);
        } catch (_) {
            return false;
        }
    }

    function installCaptureHooks() {
        if (STATE.captureInstalled) return;
        STATE.captureInstalled = true;

        const rawFetch = window.fetch;
        window.fetch = function (input, init) {
            try {
                const inputUrl = typeof input === 'string' ? input : input?.url;
                const url = inputUrl ? new URL(inputUrl, window.location.origin).toString() : '';
                if (url && (isConversationUrl(url) || isConversationListUrl(url))) {
                    STATE.capturedHeaders = sanitizeHeaders({
                        ...parseHeadersObject(typeof input !== 'string' ? input?.headers : null),
                        ...parseHeadersObject(init?.headers),
                        ...(STATE.capturedHeaders || {})
                    });
                }
            } catch (_) {}
            return rawFetch.apply(this, arguments);
        };

        const nativeOpen = XMLHttpRequest.prototype.open;
        const nativeSetHeader = XMLHttpRequest.prototype.setRequestHeader;
        const nativeSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this.__claudeRawUrl = url;
            this.__claudeRawHeaders = {};
            return nativeOpen.call(this, method, url, ...rest);
        };

        XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
            if (this.__claudeRawHeaders) this.__claudeRawHeaders[String(name).toLowerCase()] = String(value);
            return nativeSetHeader.call(this, name, value);
        };

        XMLHttpRequest.prototype.send = function (body) {
            try {
                const url = this.__claudeRawUrl ? new URL(this.__claudeRawUrl, window.location.origin).toString() : '';
                if (url && (isConversationUrl(url) || isConversationListUrl(url))) {
                    STATE.capturedHeaders = sanitizeHeaders({
                        ...(STATE.capturedHeaders || {}),
                        ...(this.__claudeRawHeaders || {})
                    });
                }
            } catch (_) {}
            return nativeSend.call(this, body);
        };
    }

    function setStatus(text, tone = 'neutral') {
        if (!STATE.statusEl) return;
        STATE.statusEl.textContent = String(text || '');
        STATE.statusEl.style.color = tone === 'error'
            ? '#dc2626'
            : (tone === 'ok' ? '#065f46' : '#334155');
    }

    function summarizeConversation(json) {
        const chatMessages = Array.isArray(json?.chat_messages) ? json.chat_messages : [];
        const counts = { human: 0, assistant: 0, other: 0, files: 0, images: 0 };
        chatMessages.forEach((msg) => {
            const sender = String(msg?.sender || '').toLowerCase();
            if (sender === 'human') counts.human += 1;
            else if (sender === 'assistant') counts.assistant += 1;
            else counts.other += 1;

            const files = Array.isArray(msg?.files) ? msg.files : [];
            counts.files += files.length;
            files.forEach((f) => {
                const kind = String(f?.file_kind || f?.kind || '').toLowerCase();
                const mime = String(f?.mime_type || '').toLowerCase();
                if (kind === 'image' || mime.startsWith('image/')) counts.images += 1;
            });
        });
        return counts;
    }

    function renderJson(json) {
        const text = JSON.stringify(json, null, 2);
        STATE.lastJsonText = text;
        if (STATE.outputEl) STATE.outputEl.textContent = text;

        const counts = summarizeConversation(json);
        const title = String(json?.name || '').trim() || '(untitled)';
        const model = String(json?.model || '').trim() || '-';
        const updatedAt = String(json?.updated_at || '').trim() || '-';
        if (STATE.convMetaEl) {
            STATE.convMetaEl.innerHTML = [
                `<div><b>标题:</b> ${escapeHtml(title)}</div>`,
                `<div><b>模型:</b> ${escapeHtml(model)}</div>`,
                `<div><b>更新时间:</b> ${escapeHtml(updatedAt)}</div>`,
                `<div><b>消息数:</b> human ${counts.human} / assistant ${counts.assistant} / other ${counts.other}</div>`,
                `<div><b>文件数:</b> ${counts.files}，其中图片 ${counts.images}</div>`
            ].join('');
        }
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    async function fetchConversationRaw() {
        installCaptureHooks();
        const convId = getConversationIdFromUrl();
        const orgId = getOrgIdFromCookie() || parseClaudeApiMeta(STATE.capturedHeaders?.__url || '')?.orgId || '';
        if (!convId) throw new Error('未从 URL 解析到 conversation id');
        if (!orgId) throw new Error('未从 cookie 解析到 org id');

        const u = new URL(`https://claude.ai/api/organizations/${encodeURIComponent(orgId)}/chat_conversations/${encodeURIComponent(convId)}`);
        u.searchParams.set('tree', 'True');
        u.searchParams.set('rendering_mode', 'messages');
        u.searchParams.set('render_all_tools', 'true');
        u.searchParams.set('consistency', 'strong');

        const headers = sanitizeHeaders(STATE.capturedHeaders || {});
        const resp = await fetch(u.toString(), {
            method: 'GET',
            credentials: 'include',
            headers
        });
        const rawText = await resp.text();
        if (!resp.ok) {
            throw new Error(`请求失败: ${resp.status}\n${rawText.slice(0, 300)}`);
        }
        let json = null;
        try {
            json = JSON.parse(rawText);
        } catch (_) {
            throw new Error('响应不是合法 JSON');
        }
        STATE.lastJson = json;
        STATE.lastFetchedAt = Date.now();
        return json;
    }

    async function refreshRawJson(silent = false) {
        if (!silent) setStatus('抓取中...');
        try {
            const json = await fetchConversationRaw();
            renderJson(json);
            const seconds = new Date(STATE.lastFetchedAt).toLocaleTimeString();
            setStatus(`抓取成功 ${seconds}`, 'ok');
        } catch (e) {
            console.warn('Claude Raw Messages Test: fetch failed', e);
            setStatus(String(e?.message || e || '抓取失败'), 'error');
        }
    }

    async function copyJson() {
        if (!STATE.lastJsonText) {
            setStatus('暂无可复制 JSON', 'error');
            return;
        }
        try {
            await navigator.clipboard.writeText(STATE.lastJsonText);
            setStatus('已复制 JSON', 'ok');
        } catch (e) {
            setStatus('复制失败，请手动复制', 'error');
        }
    }

    function downloadJson() {
        if (!STATE.lastJsonText) {
            setStatus('暂无可下载 JSON', 'error');
            return;
        }
        const convId = getConversationIdFromUrl() || 'claude-conversation';
        const blob = new Blob([STATE.lastJsonText], { type: 'application/json;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `claude-raw-${convId}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        setStatus('已下载 JSON', 'ok');
    }

    function toggleAutoRefresh(btn) {
        STATE.autoRefresh = !STATE.autoRefresh;
        btn.textContent = STATE.autoRefresh ? '自动刷新: 开' : '自动刷新: 关';
        btn.style.background = STATE.autoRefresh ? '#065f46' : '#334155';
        if (STATE.autoTimer) {
            clearInterval(STATE.autoTimer);
            STATE.autoTimer = 0;
        }
        if (STATE.autoRefresh) {
            STATE.autoTimer = window.setInterval(() => {
                if (document.hidden) return;
                refreshRawJson(true);
            }, 2500);
        }
    }

    function buildPanel() {
        if (STATE.panel?.isConnected) return;
        const panel = document.createElement('div');
        panel.style.cssText = [
            'position:fixed',
            'right:18px',
            'bottom:18px',
            'width:560px',
            'max-width:calc(100vw - 24px)',
            'height:420px',
            'z-index:2147483646',
            'background:#ffffff',
            'border:1px solid rgba(148,163,184,.35)',
            'border-radius:14px',
            'box-shadow:0 20px 48px rgba(15,23,42,.22)',
            'display:flex',
            'flex-direction:column',
            'overflow:hidden',
            'font:12px/1.5 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif'
        ].join(';');

        panel.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);color:#fff;">
                <div>
                    <div style="font-size:13px;font-weight:700;">Claude Raw Messages Test</div>
                    <div style="font-size:11px;opacity:.82;">当前会话原始 chat_conversations JSON</div>
                </div>
                <button data-act="close" style="border:none;background:transparent;color:#fff;font-size:18px;cursor:pointer;line-height:1;">×</button>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid #e2e8f0;background:#f8fafc;">
                <button data-act="refresh" style="border:none;background:#2563eb;color:#fff;padding:7px 10px;border-radius:8px;cursor:pointer;">抓取当前会话</button>
                <button data-act="copy" style="border:none;background:#0f766e;color:#fff;padding:7px 10px;border-radius:8px;cursor:pointer;">复制 JSON</button>
                <button data-act="download" style="border:none;background:#7c3aed;color:#fff;padding:7px 10px;border-radius:8px;cursor:pointer;">下载 JSON</button>
                <button data-act="auto" style="border:none;background:#334155;color:#fff;padding:7px 10px;border-radius:8px;cursor:pointer;">自动刷新: 关</button>
                <button data-act="clear" style="border:none;background:#475569;color:#fff;padding:7px 10px;border-radius:8px;cursor:pointer;">清空</button>
            </div>
            <div data-role="status" style="padding:8px 12px;border-bottom:1px solid #e2e8f0;background:#fff;color:#334155;">等待抓取...</div>
            <div data-role="meta" style="padding:8px 12px;border-bottom:1px solid #e2e8f0;background:#fff;color:#475569;display:grid;gap:4px;"></div>
            <pre data-role="output" style="margin:0;flex:1;overflow:auto;padding:12px;background:#0b1020;color:#dbeafe;white-space:pre-wrap;word-break:break-word;"></pre>
        `;

        const closeBtn = panel.querySelector('[data-act="close"]');
        const refreshBtn = panel.querySelector('[data-act="refresh"]');
        const copyBtn = panel.querySelector('[data-act="copy"]');
        const downloadBtn = panel.querySelector('[data-act="download"]');
        const autoBtn = panel.querySelector('[data-act="auto"]');
        const clearBtn = panel.querySelector('[data-act="clear"]');

        STATE.panel = panel;
        STATE.statusEl = panel.querySelector('[data-role="status"]');
        STATE.outputEl = panel.querySelector('[data-role="output"]');
        STATE.convMetaEl = panel.querySelector('[data-role="meta"]');

        closeBtn.addEventListener('click', () => {
            if (STATE.autoTimer) {
                clearInterval(STATE.autoTimer);
                STATE.autoTimer = 0;
            }
            panel.remove();
        });
        refreshBtn.addEventListener('click', () => refreshRawJson(false));
        copyBtn.addEventListener('click', () => copyJson());
        downloadBtn.addEventListener('click', () => downloadJson());
        autoBtn.addEventListener('click', () => toggleAutoRefresh(autoBtn));
        clearBtn.addEventListener('click', () => {
            STATE.lastJson = null;
            STATE.lastJsonText = '';
            if (STATE.outputEl) STATE.outputEl.textContent = '';
            if (STATE.convMetaEl) STATE.convMetaEl.textContent = '';
            setStatus('已清空');
        });

        document.body.appendChild(panel);
    }

    async function boot() {
        installCaptureHooks();
        while (!document.body) await sleep(50);
        buildPanel();
        setStatus('已就绪，先在 Claude 会话内操作一轮，若 headers 尚未捕获也可直接抓取');
        refreshRawJson(true);
    }

    boot();
})();
