// ==UserScript==
// @name         Claude Download Chain Test
// @namespace    https://example.com/
// @version      0.1.0
// @description  监控 Claude 交互演示下载链路：抓取 fetch/XHR/Blob/createObjectURL/postMessage 等事件，辅助定位真实 HTML 下载流程
// @match        *://claude.ai/chat/*
// @grant        none
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const host = String(window.location.hostname || '');
    const path = String(window.location.pathname || '');
    const isClaude = /^claude\.ai$/i.test(host) && /^\/chat(?:\/[0-9a-f-]{36})?\/?$/i.test(path);
    if (!isClaude) return;

    const MAX_EVENTS = 400;
    const MAX_TEXT = 12000;
    const MAX_SNIPPET = 1200;
    const KEYWORDS = [
        'downloadfile',
        'visualize',
        'widget_code',
        'text/html',
        '<html',
        '<svg',
        'createobjecturl',
        'blob:',
        '.html',
        'mcp_app_bridge',
        'sendprompt',
        'artifact',
        'claudeusercontent'
    ];

    const STATE = {
        installed: false,
        seq: 0,
        events: [],
        objectUrls: new Map(),
        pendingBlobReads: 0,
        panel: null,
        listEl: null,
        detailEl: null,
        statusEl: null,
        expanded: true,
        selectedEventId: '',
        autoScroll: true
    };

    function nowIso() {
        return new Date().toISOString();
    }

    function shortText(text, n = 140) {
        const s = String(text || '').replace(/\s+/g, ' ').trim();
        return s.length > n ? `${s.slice(0, n)}...` : s;
    }

    function safeJson(value) {
        try {
            return JSON.stringify(value);
        } catch (_) {
            return '[unserializable]';
        }
    }

    function escapeHtml(text) {
        return String(text || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function limitText(text, max = MAX_TEXT) {
        const s = String(text || '');
        return s.length > max ? `${s.slice(0, max)}\n...[truncated ${s.length - max} chars]` : s;
    }

    function textFromBytes(bytes) {
        if (!(bytes instanceof Uint8Array)) return '';
        try {
            return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        } catch (_) {
            try {
                return new TextDecoder().decode(bytes);
            } catch (_) {
                return '';
            }
        }
    }

    function serializeHeaders(headersLike) {
        const out = {};
        if (!headersLike) return out;
        if (headersLike instanceof Headers) {
            headersLike.forEach((v, k) => out[String(k).toLowerCase()] = String(v));
            return out;
        }
        if (Array.isArray(headersLike)) {
            headersLike.forEach((pair) => {
                if (!Array.isArray(pair) || pair.length < 2) return;
                out[String(pair[0]).toLowerCase()] = String(pair[1]);
            });
            return out;
        }
        if (typeof headersLike === 'object') {
            Object.entries(headersLike).forEach(([k, v]) => out[String(k).toLowerCase()] = String(v));
        }
        return out;
    }

    function cloneSimple(value, depth = 0) {
        if (depth > 4) return '[depth-limit]';
        if (value == null) return value;
        if (typeof value === 'string') return limitText(value, 4000);
        if (typeof value === 'number' || typeof value === 'boolean') return value;
        if (typeof value === 'function') return `[function ${value.name || 'anonymous'}]`;
        if (value instanceof ArrayBuffer) return `[ArrayBuffer ${value.byteLength}]`;
        if (ArrayBuffer.isView(value)) return `[${value.constructor?.name || 'TypedArray'} ${value.byteLength || value.length || 0}]`;
        if (value instanceof Blob) return `[Blob ${value.type || 'application/octet-stream'} ${value.size}]`;
        if (value instanceof MessagePort) return '[MessagePort]';
        if (value instanceof Window) return '[Window]';
        if (value instanceof EventTarget && !(value instanceof Node)) return `[${value.constructor?.name || 'EventTarget'}]`;
        if (value instanceof Element) {
            const tag = String(value.tagName || '').toLowerCase();
            return `<${tag}${value.id ? `#${value.id}` : ''}${value.className ? `.${String(value.className).trim().replace(/\s+/g, '.')}` : ''}>`;
        }
        if (Array.isArray(value)) return value.slice(0, 12).map((item) => cloneSimple(item, depth + 1));
        if (typeof value === 'object') {
            const out = {};
            Object.keys(value).slice(0, 20).forEach((key) => {
                try {
                    out[key] = cloneSimple(value[key], depth + 1);
                } catch (e) {
                    out[key] = `[error ${e?.message || e}]`;
                }
            });
            return out;
        }
        return String(value);
    }

    function looksInterestingText(text) {
        const s = String(text || '');
        if (!s) return false;
        const lower = s.toLowerCase();
        return KEYWORDS.some((kw) => lower.includes(kw));
    }

    function looksInterestingUrl(url) {
        const s = String(url || '').toLowerCase();
        return !!s && (
            s.includes('/v1/b')
            || s.includes('datadoghq.com')
            || s.includes('segment')
            || s.includes('analytics')
            || s.includes('claudeusercontent')
            || s.includes('.html')
            || s.includes('blob:')
        );
    }

    function isInterestingPayload(payload) {
        if (payload == null) return false;
        if (typeof payload === 'string') return looksInterestingText(payload);
        try {
            return looksInterestingText(JSON.stringify(payload));
        } catch (_) {
            return false;
        }
    }

    function summarizePayload(payload) {
        if (payload == null) return '';
        if (typeof payload === 'string') return shortText(payload, 180);
        if (payload instanceof Blob) return `Blob ${payload.type || 'application/octet-stream'} ${payload.size}`;
        if (payload instanceof ArrayBuffer) return `ArrayBuffer ${payload.byteLength}`;
        if (ArrayBuffer.isView(payload)) return `${payload.constructor?.name || 'TypedArray'} ${payload.byteLength || payload.length || 0}`;
        if (typeof payload === 'object') {
            const keys = Object.keys(payload);
            if (!keys.length) return '{}';
            const out = {};
            keys.slice(0, 6).forEach((key) => out[key] = cloneSimple(payload[key], 1));
            return shortText(safeJson(out), 180);
        }
        return shortText(String(payload), 180);
    }

    function pushEvent(type, title, detail, force = false) {
        const detailText = typeof detail?.text === 'string' ? detail.text : '';
        const payloadSummary = summarizePayload(detail?.payload);
        const interesting = force
            || looksInterestingUrl(detail?.url || '')
            || looksInterestingText(title)
            || looksInterestingText(detailText)
            || isInterestingPayload(detail?.payload)
            || isInterestingPayload(detail?.requestBody)
            || isInterestingPayload(detail?.responseBody);
        if (!interesting) return null;

        const event = {
            id: `evt-${Date.now()}-${++STATE.seq}`,
            ts: Date.now(),
            iso: nowIso(),
            type,
            title,
            summary: shortText(detail?.summary || payloadSummary || detail?.url || title, 200),
            detail: cloneSimple(detail)
        };
        STATE.events.push(event);
        if (STATE.events.length > MAX_EVENTS) STATE.events.splice(0, STATE.events.length - MAX_EVENTS);
        if (!STATE.selectedEventId) STATE.selectedEventId = event.id;
        renderPanel();
        return event;
    }

    async function blobToText(blob) {
        if (!(blob instanceof Blob)) return '';
        try {
            const text = await blob.text();
            return limitText(text);
        } catch (_) {
            try {
                const ab = await blob.arrayBuffer();
                return limitText(textFromBytes(new Uint8Array(ab)));
            } catch (_) {
                return '';
            }
        }
    }

    function makePanel() {
        if (STATE.panel || document.readyState === 'loading') return;

        const panel = document.createElement('div');
        panel.id = 'claude-download-chain-test-panel';
        panel.style.cssText = [
            'position:fixed',
            'right:18px',
            'bottom:18px',
            'z-index:2147483647',
            'width:420px',
            'max-width:calc(100vw - 24px)',
            'max-height:72vh',
            'display:flex',
            'flex-direction:column',
            'background:rgba(255,255,255,0.98)',
            'border:1px solid #cbd5e1',
            'border-radius:16px',
            'box-shadow:0 16px 40px rgba(15,23,42,0.18)',
            'backdrop-filter:blur(10px)',
            'overflow:hidden',
            'font:12px/1.45 "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
            'color:#0f172a'
        ].join(';');

        panel.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #e2e8f0;background:linear-gradient(180deg,#f8fafc 0%, #fff 100%);">
                <div style="font-weight:700;color:#0f172a;">Claude 下载链路监控</div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <button type="button" data-act="clear" style="border:none;background:#eff6ff;color:#1d4ed8;border-radius:8px;padding:6px 10px;cursor:pointer;">清空</button>
                    <button type="button" data-act="export" style="border:none;background:#dcfce7;color:#166534;border-radius:8px;padding:6px 10px;cursor:pointer;">导出</button>
                    <button type="button" data-act="toggle" style="border:none;background:#f1f5f9;color:#334155;border-radius:8px;padding:6px 10px;cursor:pointer;">收起</button>
                </div>
            </div>
            <div style="padding:8px 12px;border-bottom:1px solid #e2e8f0;color:#475569;">
                <div id="cdct-status">等待交互...</div>
                <div style="margin-top:4px;font-size:11px;color:#64748b;">提示: 打开 Claude 交互演示后，点击其下载按钮，再回来看这里。</div>
            </div>
            <div id="cdct-body" style="display:grid;grid-template-columns:170px minmax(0,1fr);min-height:220px;max-height:56vh;">
                <div id="cdct-list" style="overflow:auto;border-right:1px solid #e2e8f0;background:#fcfdff;"></div>
                <pre id="cdct-detail" style="margin:0;overflow:auto;padding:10px 12px;background:#fff;color:#0f172a;white-space:pre-wrap;word-break:break-word;"></pre>
            </div>
        `;

        document.body.appendChild(panel);
        STATE.panel = panel;
        STATE.listEl = panel.querySelector('#cdct-list');
        STATE.detailEl = panel.querySelector('#cdct-detail');
        STATE.statusEl = panel.querySelector('#cdct-status');

        panel.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-act]');
            if (!btn) return;
            const act = btn.getAttribute('data-act');
            if (act === 'clear') {
                STATE.events = [];
                STATE.selectedEventId = '';
                renderPanel();
                return;
            }
            if (act === 'export') {
                exportEvents();
                return;
            }
            if (act === 'toggle') {
                STATE.expanded = !STATE.expanded;
                renderPanel();
            }
        });

        STATE.listEl.addEventListener('click', (e) => {
            const row = e.target.closest('[data-event-id]');
            if (!row) return;
            STATE.selectedEventId = row.getAttribute('data-event-id') || '';
            renderPanel();
        });

        renderPanel();
    }

    function renderPanel() {
        if (!STATE.panel) return;
        const body = STATE.panel.querySelector('#cdct-body');
        if (body) body.style.display = STATE.expanded ? 'grid' : 'none';
        const toggleBtn = STATE.panel.querySelector('button[data-act="toggle"]');
        if (toggleBtn) toggleBtn.textContent = STATE.expanded ? '收起' : '展开';

        if (STATE.statusEl) {
            STATE.statusEl.textContent = `已捕获 ${STATE.events.length} 条事件 · Blob 读中 ${STATE.pendingBlobReads}`;
        }

        if (STATE.listEl) {
            STATE.listEl.innerHTML = STATE.events.length
                ? STATE.events.slice().reverse().map((evt) => {
                    const active = evt.id === STATE.selectedEventId;
                    return `
                        <div
                            data-event-id="${escapeHtml(evt.id)}"
                            style="padding:8px 10px;border-bottom:1px solid #edf2f7;cursor:pointer;background:${active ? '#dbeafe' : 'transparent'};"
                        >
                            <div style="font-weight:700;color:${active ? '#1d4ed8' : '#0f172a'};">${escapeHtml(evt.type)} · ${escapeHtml(evt.title)}</div>
                            <div style="margin-top:4px;font-size:11px;color:#64748b;">${escapeHtml(new Date(evt.ts).toLocaleTimeString())}</div>
                            <div style="margin-top:4px;font-size:11px;color:#334155;">${escapeHtml(evt.summary)}</div>
                        </div>
                    `;
                }).join('')
                : '<div style="padding:12px;color:#64748b;">暂无事件</div>';
        }

        const current = STATE.events.find((evt) => evt.id === STATE.selectedEventId) || STATE.events[STATE.events.length - 1] || null;
        if (current && STATE.detailEl) {
            STATE.detailEl.textContent = JSON.stringify(current, null, 2);
        } else if (STATE.detailEl) {
            STATE.detailEl.textContent = '暂无详情';
        }
    }

    function exportEvents() {
        const payload = {
            exportedAt: nowIso(),
            url: window.location.href,
            total: STATE.events.length,
            events: STATE.events
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Claude_Download_Chain_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    function installHooks() {
        if (STATE.installed) return;
        STATE.installed = true;

        const NativeBlob = window.Blob;
        const nativeCreateObjectURL = URL.createObjectURL.bind(URL);
        const nativeRevokeObjectURL = URL.revokeObjectURL.bind(URL);
        const rawFetch = window.fetch.bind(window);
        const nativeXhrOpen = XMLHttpRequest.prototype.open;
        const nativeXhrSend = XMLHttpRequest.prototype.send;
        const nativeXhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
        const nativeWindowPostMessage = window.postMessage.bind(window);
        const nativePortPostMessage = MessagePort.prototype.postMessage;
        const nativeAnchorClick = HTMLAnchorElement.prototype.click;

        window.Blob = function BlobPatched(parts, options) {
            const blob = new NativeBlob(parts, options);
            const type = String(options?.type || blob.type || '').toLowerCase();
            const interesting = type.includes('html')
                || type.includes('svg')
                || type.includes('json')
                || (Array.isArray(parts) && parts.some((part) => {
                    if (typeof part === 'string') return looksInterestingText(part);
                    if (part instanceof Blob) return /html|svg|json/i.test(part.type || '');
                    return false;
                }));
            if (interesting) {
                STATE.pendingBlobReads += 1;
                blobToText(blob).then((text) => {
                    pushEvent('blob', 'Blob()', {
                        summary: `${type || 'unknown'} · ${blob.size} bytes`,
                        mimeType: type,
                        size: blob.size,
                        text: limitText(text, MAX_TEXT),
                        snippet: shortText(text, MAX_SNIPPET),
                        partPreview: cloneSimple(parts, 1)
                    }, true);
                }).finally(() => {
                    STATE.pendingBlobReads = Math.max(0, STATE.pendingBlobReads - 1);
                    renderPanel();
                });
            }
            return blob;
        };
        window.Blob.prototype = NativeBlob.prototype;

        URL.createObjectURL = function createObjectURLPatched(obj) {
            const url = nativeCreateObjectURL(obj);
            if (obj instanceof Blob) {
                STATE.objectUrls.set(url, {
                    type: obj.type || '',
                    size: obj.size || 0,
                    createdAt: nowIso()
                });
                const interesting = /html|svg|json/i.test(obj.type || '') || obj.size > 0;
                if (interesting) {
                    STATE.pendingBlobReads += 1;
                    blobToText(obj).then((text) => {
                        pushEvent('object-url', 'URL.createObjectURL', {
                            summary: `${obj.type || 'blob'} · ${obj.size} bytes`,
                            url,
                            mimeType: obj.type || '',
                            size: obj.size || 0,
                            text: limitText(text, MAX_TEXT),
                            snippet: shortText(text, MAX_SNIPPET)
                        }, true);
                    }).finally(() => {
                        STATE.pendingBlobReads = Math.max(0, STATE.pendingBlobReads - 1);
                        renderPanel();
                    });
                }
            } else {
                pushEvent('object-url', 'URL.createObjectURL', {
                    summary: `${url} (non-blob)`,
                    url,
                    payload: cloneSimple(obj)
                });
            }
            return url;
        };

        URL.revokeObjectURL = function revokeObjectURLPatched(url) {
            if (STATE.objectUrls.has(url)) {
                pushEvent('object-url', 'URL.revokeObjectURL', {
                    summary: url,
                    url,
                    meta: STATE.objectUrls.get(url)
                }, true);
                STATE.objectUrls.delete(url);
            }
            return nativeRevokeObjectURL(url);
        };

        window.fetch = async function fetchPatched(input, init) {
            const requestUrl = typeof input === 'string' ? input : (input?.url || '');
            let requestBody = init?.body;
            if (typeof input !== 'string' && input instanceof Request && requestBody == null) {
                requestBody = '[Request body not cloned]';
            }
            const bodySummary = summarizePayload(requestBody);
            const shouldInspect = looksInterestingUrl(requestUrl) || isInterestingPayload(requestBody);
            if (shouldInspect) {
                pushEvent('fetch', 'request', {
                    summary: `${requestUrl} ${bodySummary}`,
                    url: requestUrl,
                    method: String(init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase(),
                    headers: serializeHeaders(init?.headers || (typeof input !== 'string' ? input?.headers : null)),
                    requestBody: cloneSimple(requestBody),
                    text: typeof requestBody === 'string' ? limitText(requestBody) : ''
                }, true);
            }

            const resp = await rawFetch(input, init);
            if (shouldInspect) {
                try {
                    const clone = resp.clone();
                    const ct = clone.headers.get('content-type') || '';
                    let text = '';
                    if (/json|text|javascript|html|svg/i.test(ct)) {
                        text = limitText(await clone.text());
                    } else {
                        const ab = await clone.arrayBuffer();
                        text = limitText(textFromBytes(new Uint8Array(ab)), 6000);
                    }
                    pushEvent('fetch', 'response', {
                        summary: `${resp.status} ${requestUrl}`,
                        url: requestUrl,
                        status: resp.status,
                        ok: resp.ok,
                        contentType: ct,
                        responseBody: text,
                        text
                    }, true);
                } catch (e) {
                    pushEvent('fetch', 'response-read-error', {
                        summary: `${requestUrl} ${e?.message || e}`,
                        url: requestUrl,
                        error: String(e?.message || e)
                    }, true);
                }
            }
            return resp;
        };

        XMLHttpRequest.prototype.open = function openPatched(method, url, ...rest) {
            this.__cdct = {
                method: String(method || 'GET').toUpperCase(),
                url: String(url || ''),
                headers: {}
            };
            return nativeXhrOpen.call(this, method, url, ...rest);
        };

        XMLHttpRequest.prototype.setRequestHeader = function setRequestHeaderPatched(name, value) {
            if (this.__cdct) this.__cdct.headers[String(name).toLowerCase()] = String(value);
            return nativeXhrSetRequestHeader.call(this, name, value);
        };

        XMLHttpRequest.prototype.send = function sendPatched(body) {
            const meta = this.__cdct || { method: 'GET', url: '', headers: {} };
            const shouldInspect = looksInterestingUrl(meta.url) || isInterestingPayload(body);
            if (shouldInspect) {
                pushEvent('xhr', 'request', {
                    summary: `${meta.method} ${meta.url}`,
                    url: meta.url,
                    method: meta.method,
                    headers: meta.headers,
                    requestBody: cloneSimple(body),
                    text: typeof body === 'string' ? limitText(body) : ''
                }, true);
                this.addEventListener('loadend', () => {
                    pushEvent('xhr', 'response', {
                        summary: `${this.status} ${meta.url}`,
                        url: meta.url,
                        method: meta.method,
                        status: this.status,
                        responseType: this.responseType || '',
                        responseText: typeof this.responseText === 'string' ? limitText(this.responseText) : '',
                        text: typeof this.responseText === 'string' ? limitText(this.responseText) : ''
                    }, true);
                }, { once: true });
            }
            return nativeXhrSend.call(this, body);
        };

        window.postMessage = function postMessagePatched(message, targetOrigin, transfer) {
            if (isInterestingPayload(message)) {
                pushEvent('postMessage', 'window.postMessage', {
                    summary: summarizePayload(message),
                    targetOrigin: String(targetOrigin || ''),
                    payload: cloneSimple(message),
                    text: typeof message === 'string' ? limitText(message) : ''
                }, true);
            }
            return nativeWindowPostMessage(message, targetOrigin, transfer);
        };

        MessagePort.prototype.postMessage = function portPostMessagePatched(message, transfer) {
            if (isInterestingPayload(message)) {
                pushEvent('message-port', 'MessagePort.postMessage', {
                    summary: summarizePayload(message),
                    payload: cloneSimple(message),
                    text: typeof message === 'string' ? limitText(message) : ''
                }, true);
            }
            return nativePortPostMessage.call(this, message, transfer);
        };

        window.addEventListener('message', (event) => {
            if (!isInterestingPayload(event.data)) return;
            pushEvent('message', 'window message', {
                summary: summarizePayload(event.data),
                origin: event.origin,
                payload: cloneSimple(event.data),
                text: typeof event.data === 'string' ? limitText(event.data) : ''
            }, true);
        }, true);

        document.addEventListener('click', (event) => {
            const target = event.target instanceof Element ? event.target.closest('a,button,[role="button"]') : null;
            if (!target) return;
            const text = shortText(target.innerText || target.textContent || target.getAttribute('aria-label') || '', 120);
            const href = target.getAttribute('href') || '';
            const download = target.getAttribute('download') || '';
            const payload = { text, href, download, tag: String(target.tagName || '').toLowerCase() };
            if (looksInterestingText(text) || looksInterestingUrl(href) || download) {
                pushEvent('click', 'element click', {
                    summary: `${payload.tag} ${text || href || download}`,
                    payload
                }, true);
            }
        }, true);

        HTMLAnchorElement.prototype.click = function anchorClickPatched() {
            const href = String(this.href || this.getAttribute('href') || '').trim();
            const download = String(this.download || '').trim();
            if (looksInterestingUrl(href) || download) {
                pushEvent('anchor', 'HTMLAnchorElement.click', {
                    summary: `${download || href}`,
                    href,
                    download,
                    text: shortText(this.innerText || this.textContent || '', 120)
                }, true);
            }
            return nativeAnchorClick.call(this);
        };
    }

    function bootstrap() {
        installHooks();
        if (document.body) makePanel();
        else {
            document.addEventListener('DOMContentLoaded', makePanel, { once: true });
        }
        pushEvent('system', 'monitor-started', {
            summary: 'Claude 下载链路监控已启动',
            url: window.location.href
        }, true);
        window.__CLAUDE_DOWNLOAD_CHAIN_TEST__ = {
            state: STATE,
            exportEvents,
            getEvents: () => STATE.events.slice(),
            clear: () => {
                STATE.events = [];
                STATE.selectedEventId = '';
                renderPanel();
            }
        };
    }

    bootstrap();
})();
