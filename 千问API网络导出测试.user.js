// ==UserScript==
// @name         千问API网络导出测试
// @namespace    http://tampermonkey.net/
// @version      0.1.0
// @description  在千问页面直接调用 /api/v1/session/msg/list 测试会话消息拉取与解析
// @author       xchengb
// @match        *://*.qianwen.com/*
// @match        *://tongyi.aliyun.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const API_PATH = '/api/v1/session/msg/list';
    const DEFAULT_URL = 'https://chat2-api.qianwen.com/api/v1/session/msg/list?return_response_messages=true&session_id=61d1a54c517940cb8d3e531de8d83403&biz_id=ai_qwen&event_filter=all&page_size=50&chat_client=h5&device=pc&fr=pc&pr=qwen&ut=8d6b04ee-d087-0988-9acc-368bf0340941&la=zh-CN&tz=Asia%2FShanghai&nonce=hvp7pykrr2s&timestamp=1774975557465';

    let capturedTemplate = null;

    function log() {
        console.log('[Qwen-API-Test]', ...arguments);
    }

    function createNonce(len) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let out = '';
        for (let i = 0; i < len; i++) {
            out += chars[Math.floor(Math.random() * chars.length)];
        }
        return out;
    }

    function findAny(obj, keys) {
        if (!obj || typeof obj !== 'object') return '';
        for (const k of keys) {
            if (obj[k]) return String(obj[k]);
        }
        return '';
    }

    function getSessionIdFromUrl() {
        const url = new URL(location.href);
        const q = url.searchParams.get('session_id');
        if (q) return q;

        const m1 = url.pathname.match(/\/chat\/([a-zA-Z0-9_-]{16,})/);
        if (m1) return m1[1];

        const m2 = url.pathname.match(/\/session\/([a-zA-Z0-9_-]{16,})/);
        if (m2) return m2[1];

        return '';
    }

    function getUtFromPage() {
        try {
            if (capturedTemplate?.url) {
                const u = new URL(capturedTemplate.url, location.origin);
                const ut = u.searchParams.get('ut');
                if (ut) return ut;
            }
        } catch (e) {
            // ignore
        }

        const tryKeys = [
            'ut', 'x-qwen-ut', 'qwen-ut', 'qwen_ut', 'X-Qwen-UT',
            'deviceId', 'device_id', 'utdid'
        ];

        for (const k of tryKeys) {
            const v1 = localStorage.getItem(k);
            if (v1) return String(v1);
            const v2 = sessionStorage.getItem(k);
            if (v2) return String(v2);
        }

        return '';
    }

    function isQwenMsgListUrl(rawUrl) {
        try {
            const u = new URL(rawUrl, location.origin);
            return u.pathname.includes(API_PATH);
        } catch (e) {
            return false;
        }
    }

    function sanitizeHeaders(headersObj) {
        const blocked = new Set([
            'cookie', 'host', 'origin', 'referer', 'content-length',
            'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest',
            'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
            'accept-encoding', 'connection', ':authority', ':method', ':path', ':scheme'
        ]);

        const out = {};
        Object.entries(headersObj || {}).forEach(([k, v]) => {
            const key = String(k).toLowerCase();
            if (!blocked.has(key)) out[key] = String(v);
        });

        if (!out.accept) out.accept = 'application/json, text/plain, */*';
        return out;
    }

    function parseHeadersObject(headersLike) {
        if (!headersLike) return {};
        if (headersLike instanceof Headers) {
            const obj = {};
            headersLike.forEach((v, k) => obj[k] = v);
            return obj;
        }
        if (Array.isArray(headersLike)) {
            const obj = {};
            headersLike.forEach(([k, v]) => obj[String(k)] = String(v));
            return obj;
        }
        if (typeof headersLike === 'object') return { ...headersLike };
        return {};
    }

    function ensureRequestUrl(rawUrl, sessionId) {
        const base = rawUrl || capturedTemplate?.url || DEFAULT_URL;
        const u = new URL(base, location.origin);

        if (!u.pathname.includes(API_PATH)) {
            u.hostname = 'chat2-api.qianwen.com';
            u.pathname = API_PATH;
        }

        const now = Date.now();
        const defaults = {
            return_response_messages: 'true',
            biz_id: 'ai_qwen',
            event_filter: 'all',
            page_size: '50',
            chat_client: 'h5',
            device: 'pc',
            fr: 'pc',
            pr: 'qwen',
            la: 'zh-CN',
            tz: 'Asia/Shanghai'
        };

        Object.entries(defaults).forEach(([k, v]) => {
            if (!u.searchParams.get(k)) u.searchParams.set(k, v);
        });

        if (sessionId) u.searchParams.set('session_id', sessionId);

        const ut = getUtFromPage();
        if (ut && !u.searchParams.get('ut')) u.searchParams.set('ut', ut);

        u.searchParams.set('nonce', createNonce(11));
        u.searchParams.set('timestamp', String(now));

        return u.toString();
    }

    function safeParseJson(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    function extractText(node, bucket) {
        if (!node) return;
        if (typeof node === 'string') {
            const t = node.trim();
            if (t) bucket.push(t);
            return;
        }
        if (Array.isArray(node)) {
            node.forEach((item) => extractText(item, bucket));
            return;
        }
        if (typeof node !== 'object') return;

        const directKeys = [
            'text', 'content', 'message', 'msg', 'answer', 'question', 'value', 'display_text'
        ];

        directKeys.forEach((k) => {
            if (typeof node[k] === 'string') {
                const t = node[k].trim();
                if (t) bucket.push(t);
            }
        });

        if (typeof node.delta === 'string') {
            const t = node.delta.trim();
            if (t) bucket.push(t);
        }

        Object.values(node).forEach((v) => extractText(v, bucket));
    }

    function getRole(item) {
        const roleRaw = findAny(item, ['role', 'sender_role', 'author_role', 'message_role', 'type']);
        const role = roleRaw.toLowerCase();
        if (role.includes('assistant') || role.includes('bot') || role.includes('ai')) return 'assistant';
        if (role.includes('user') || role.includes('human') || role.includes('question')) return 'user';

        if (item?.is_user === true || item?.from_user === true) return 'user';
        if (item?.is_assistant === true || item?.from_bot === true) return 'assistant';

        const senderType = String(item?.sender_type || '').toLowerCase();
        if (senderType.includes('bot') || senderType.includes('assistant')) return 'assistant';
        if (senderType.includes('user')) return 'user';

        return 'assistant';
    }

    function parseMessagesFromResponse(respJson) {
        const candidates = [
            respJson?.data?.messages,
            respJson?.data?.list,
            respJson?.data?.items,
            respJson?.messages,
            respJson?.msg_list,
            respJson?.data?.msg_list,
            respJson?.data?.session?.messages,
            respJson?.data?.response_messages
        ];

        let arr = [];
        for (const c of candidates) {
            if (Array.isArray(c) && c.length) {
                arr = c;
                break;
            }
        }

        if (!arr.length && Array.isArray(respJson?.data?.events)) {
            arr = respJson.data.events;
        }

        const parsed = arr.map((item, idx) => {
            const textBucket = [];
            extractText(item, textBucket);

            const uniq = Array.from(new Set(textBucket.map((s) => s.trim()).filter(Boolean)));
            const text = uniq.join('\n\n').trim();

            return {
                id: findAny(item, ['message_id', 'msg_id', 'id', 'uuid']) || String(idx + 1),
                role: getRole(item),
                text,
                order: Number(findAny(item, ['index', 'seq', 'sequence', 'position']) || idx + 1)
            };
        }).filter((m) => m.text);

        parsed.sort((a, b) => a.order - b.order);
        return parsed;
    }

    function installCaptureHooks() {
        const nativeFetch = window.fetch;
        window.fetch = async function () {
            const args = Array.from(arguments);
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            const init = args[1] || {};

            if (url && isQwenMsgListUrl(url)) {
                capturedTemplate = {
                    url,
                    method: (init.method || 'GET').toUpperCase(),
                    headers: parseHeadersObject(init.headers),
                    body: typeof init.body === 'string' ? init.body : ''
                };
                log('捕获到 fetch 模板', capturedTemplate);
            }

            return nativeFetch.apply(this, args);
        };

        const nativeOpen = XMLHttpRequest.prototype.open;
        const nativeSend = XMLHttpRequest.prototype.send;
        const nativeSetHeader = XMLHttpRequest.prototype.setRequestHeader;

        XMLHttpRequest.prototype.open = function (method, url) {
            this.__qwMethod = method;
            this.__qwUrl = url;
            this.__qwHeaders = {};
            return nativeOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
            if (this.__qwHeaders) this.__qwHeaders[name] = value;
            return nativeSetHeader.call(this, name, value);
        };

        XMLHttpRequest.prototype.send = function (body) {
            if (this.__qwUrl && isQwenMsgListUrl(this.__qwUrl)) {
                capturedTemplate = {
                    url: this.__qwUrl,
                    method: String(this.__qwMethod || 'GET').toUpperCase(),
                    headers: this.__qwHeaders || {},
                    body: typeof body === 'string' ? body : ''
                };
                log('捕获到 XHR 模板', capturedTemplate);
            }
            return nativeSend.call(this, body);
        };
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function mountUI() {
        GM_addStyle(
            '.qw-test-btn { position: fixed; right: 22px; bottom: 24px; z-index: 999999; border: none; border-radius: 999px; background: #111827; color: #fff; padding: 10px 14px; font-size: 13px; cursor: pointer; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }' +
            '.qw-mask { position: fixed; inset: 0; z-index: 999999; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; }' +
            '.qw-modal { width: min(980px, 92vw); height: min(82vh, 860px); background: #fff; border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; }' +
            '.qw-head { padding: 14px 18px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }' +
            '.qw-body { padding: 14px 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; overflow: auto; }' +
            '.qw-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; }' +
            '.qw-card h4 { margin: 0 0 8px; font-size: 13px; }' +
            '.qw-input, .qw-textarea { width: 100%; box-sizing: border-box; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; font-size: 12px; }' +
            '.qw-textarea { min-height: 150px; resize: vertical; font-family: Consolas, monospace; }' +
            '.qw-actions { display: flex; gap: 8px; margin-top: 10px; }' +
            '.qw-a-btn { border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; font-size: 12px; padding: 8px 10px; cursor: pointer; }' +
            '.qw-a-btn.primary { background: #2563eb; color: #fff; border-color: #2563eb; }' +
            '.qw-log { white-space: pre-wrap; font-family: Consolas, monospace; background: #0b1020; color: #dbeafe; border-radius: 8px; padding: 10px; min-height: 86px; font-size: 12px; }' +
            '.qw-msg-list { max-height: 360px; overflow: auto; border: 1px solid #e5e7eb; border-radius: 8px; }' +
            '.qw-msg-item { padding: 10px; border-bottom: 1px solid #f1f5f9; }' +
            '.qw-msg-item:last-child { border-bottom: none; }' +
            '.qw-role { font-size: 11px; font-weight: 700; margin-bottom: 4px; }' +
            '.qw-role.user { color: #0369a1; }' +
            '.qw-role.assistant { color: #7c3aed; }' +
            '.qw-text { font-size: 12px; line-height: 1.6; color: #334155; white-space: pre-wrap; }'
        );

        const btn = document.createElement('button');
        btn.className = 'qw-test-btn';
        btn.textContent = '千问API测试';
        document.body.appendChild(btn);

        btn.addEventListener('click', () => {
            const sid = getSessionIdFromUrl();
            const overlay = document.createElement('div');
            overlay.className = 'qw-mask';

            overlay.innerHTML =
                '<div class="qw-modal">' +
                '  <div class="qw-head">' +
                '    <div style="font-weight:700;">千问 /api/v1/session/msg/list 测试面板</div>' +
                '    <button id="qw-close" class="qw-a-btn">关闭</button>' +
                '  </div>' +
                '  <div class="qw-body">' +
                '    <div class="qw-card">' +
                '      <h4>请求配置</h4>' +
                '      <label style="font-size:12px;display:block;margin-bottom:6px;">session_id</label>' +
                '      <input id="qw-sid" class="qw-input" value="' + (sid || '') + '" />' +
                '      <label style="font-size:12px;display:block;margin:10px 0 6px;">请求URL（可改）</label>' +
                '      <input id="qw-url" class="qw-input" value="' + escapeHtml(ensureRequestUrl(capturedTemplate?.url || DEFAULT_URL, sid)) + '" />' +
                '      <label style="font-size:12px;display:block;margin:10px 0 6px;">Headers JSON（可选，留空自动）</label>' +
                '      <textarea id="qw-headers" class="qw-textarea" placeholder="例如: {\n  \"accept\": \"application/json, text/plain, */*\"\n}"></textarea>' +
                '      <div class="qw-actions">' +
                '        <button id="qw-run" class="qw-a-btn primary">发起请求</button>' +
                '        <button id="qw-fill" class="qw-a-btn">填充默认Headers</button>' +
                '        <button id="qw-copy" class="qw-a-btn">复制原始响应</button>' +
                '      </div>' +
                '    </div>' +
                '    <div class="qw-card">' +
                '      <h4>请求结果</h4>' +
                '      <div id="qw-log" class="qw-log">等待发起请求...</div>' +
                '      <h4 style="margin-top:10px;">解析后的消息</h4>' +
                '      <div id="qw-list" class="qw-msg-list"></div>' +
                '    </div>' +
                '  </div>' +
                '</div>';

            const close = () => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            };

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close();
            });
            overlay.querySelector('#qw-close').addEventListener('click', close);

            const logEl = overlay.querySelector('#qw-log');
            const listEl = overlay.querySelector('#qw-list');
            let lastRaw = '';

            overlay.querySelector('#qw-fill').addEventListener('click', () => {
                const base = sanitizeHeaders({
                    ...(capturedTemplate?.headers || {}),
                    accept: 'application/json, text/plain, */*'
                });
                overlay.querySelector('#qw-headers').value = JSON.stringify(base, null, 2);
            });

            overlay.querySelector('#qw-copy').addEventListener('click', async () => {
                if (!lastRaw) return;
                try {
                    await navigator.clipboard.writeText(lastRaw);
                    logEl.textContent += '\n\n已复制原始响应到剪贴板';
                } catch (e) {
                    logEl.textContent += '\n\n复制失败：' + (e.message || String(e));
                }
            });

            overlay.querySelector('#qw-run').addEventListener('click', async () => {
                const sidVal = overlay.querySelector('#qw-sid').value.trim();
                const customUrl = overlay.querySelector('#qw-url').value.trim();
                const customHeadersText = overlay.querySelector('#qw-headers').value.trim();

                if (!sidVal) {
                    alert('session_id 不能为空');
                    return;
                }

                let customHeaders = {};
                if (customHeadersText) {
                    customHeaders = safeParseJson(customHeadersText);
                    if (!customHeaders || typeof customHeaders !== 'object') {
                        alert('Headers JSON 格式错误');
                        return;
                    }
                }

                const reqUrl = ensureRequestUrl(customUrl || capturedTemplate?.url || DEFAULT_URL, sidVal);
                const headers = sanitizeHeaders({
                    ...(capturedTemplate?.headers || {}),
                    ...customHeaders
                });

                logEl.textContent = [
                    '准备请求...',
                    'URL: ' + reqUrl,
                    'Headers: ' + JSON.stringify(headers, null, 2)
                ].join('\n\n');

                try {
                    const resp = await fetch(reqUrl, {
                        method: 'GET',
                        credentials: 'include',
                        headers
                    });

                    const text = await resp.text();
                    lastRaw = text;
                    const json = safeParseJson(text);

                    if (!resp.ok) {
                        logEl.textContent += '\n\nHTTP ' + resp.status + ' ' + resp.statusText + '\n' + text.slice(0, 1600);
                        return;
                    }

                    if (!json) {
                        logEl.textContent += '\n\n响应不是 JSON';
                        return;
                    }

                    const parsed = parseMessagesFromResponse(json);

                    const code = json.code != null ? json.code : json.status_code;
                    const msg = json.message || json.msg || json.status_desc || '';

                    logEl.textContent += [
                        '',
                        '请求成功: HTTP ' + resp.status,
                        'code/status_code: ' + String(code),
                        (msg ? ('message: ' + msg) : ''),
                        'messages: ' + parsed.length
                    ].filter(Boolean).join('\n');

                    listEl.innerHTML = parsed.map((m, idx) =>
                        '<div class="qw-msg-item">' +
                        '  <div class="qw-role ' + m.role + '">' + (idx + 1) + '. ' + (m.role === 'user' ? '用户' : '千问') + ' | id=' + escapeHtml(m.id) + '</div>' +
                        '  <div class="qw-text">' + escapeHtml(m.text) + '</div>' +
                        '</div>'
                    ).join('') || '<div class="qw-msg-item">未解析到消息，请在原始响应中确认字段路径后再调映射。</div>';
                } catch (e) {
                    logEl.textContent += '\n\n请求失败: ' + (e.message || String(e));
                }
            });

            document.body.appendChild(overlay);
        });
    }

    installCaptureHooks();
    mountUI();
    log('脚本已加载。建议先在页面正常发一条消息，便于捕获真实请求模板。');
})();
