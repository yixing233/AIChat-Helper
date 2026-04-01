// ==UserScript==
// @name         DeepSeek API 网络导出测试
// @namespace    http://tampermonkey.net/
// @version      0.1.2
// @description  在 DeepSeek 页面直接调用 /api/v0/chat/history_messages 测试会话消息拉取与解析
// @author       xchengb
// @match        *://chat.deepseek.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const API_PATH = '/api/v0/chat/history_messages';
    const DEFAULT_SESSION_ID = '62989a90-9a0e-4228-afc1-52360873a6ff';

    let capturedHeaders = null;

    function log() {
        console.log('[DeepSeek-API-Test]', ...arguments);
    }

    function safeParseJson(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    function parseHeadersObject(headersLike) {
        if (!headersLike) return {};
        if (headersLike instanceof Headers) {
            const out = {};
            headersLike.forEach((v, k) => out[k] = v);
            return out;
        }
        if (Array.isArray(headersLike)) {
            const out = {};
            headersLike.forEach(([k, v]) => out[String(k)] = String(v));
            return out;
        }
        if (typeof headersLike === 'object') return { ...headersLike };
        return {};
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

    function isTargetUrl(rawUrl) {
        try {
            const u = new URL(rawUrl, location.origin);
            return u.pathname.includes(API_PATH);
        } catch (e) {
            return false;
        }
    }

    function isLikelySessionId(str) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(str || '').trim());
    }

    function getSessionIdFromLocation() {
        try {
            const u = new URL(location.href);
            const fromQuery = u.searchParams.get('chat_session_id') || u.searchParams.get('session_id') || u.searchParams.get('id');
            if (isLikelySessionId(fromQuery)) return fromQuery;

            const pathMatch = u.pathname.match(/\/a\/chat\/s\/([0-9a-f-]{36})/i) ||
                u.pathname.match(/\/chat\/([0-9a-f-]{36})/i) ||
                u.pathname.match(/\/session\/([0-9a-f-]{36})/i);
            if (pathMatch && isLikelySessionId(pathMatch[1])) return pathMatch[1];

            if (u.hash) {
                const hashMatch = u.hash.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
                if (hashMatch && isLikelySessionId(hashMatch[1])) return hashMatch[1];
            }
        } catch (e) {
            // ignore
        }
        return '';
    }

    function getSessionIdFromPageLinks() {
        const linkCandidates = Array.from(document.querySelectorAll('a[href*="/a/chat/s/"]'));
        for (const a of linkCandidates) {
            const href = String(a.getAttribute('href') || '');
            const m = href.match(/\/a\/chat\/s\/([0-9a-f-]{36})/i);
            if (m && isLikelySessionId(m[1])) return m[1];
        }
        return '';
    }

    function detectSessionId() {
        const candidates = [
            getSessionIdFromLocation(),
            getSessionIdFromPageLinks(),
            sessionStorage.getItem('deepseek_api_test_last_session_id') || '',
            localStorage.getItem('deepseek_api_test_last_session_id') || '',
            DEFAULT_SESSION_ID
        ];

        for (const c of candidates) {
            if (isLikelySessionId(c)) return c;
        }
        return DEFAULT_SESSION_ID;
    }

    function installRealtimeSessionSync(sessionInput, resultBox) {
        let lastSynced = String(sessionInput.value || '').trim();

        function canAutoOverwrite() {
            // 输入框聚焦时不打断用户编辑
            if (document.activeElement === sessionInput) return false;
            const curr = String(sessionInput.value || '').trim();
            return !curr || curr === lastSynced || curr === DEFAULT_SESSION_ID;
        }

        function syncNow(reason) {
            const detected = String(detectSessionId() || '').trim();
            if (!isLikelySessionId(detected)) return;
            if (detected === lastSynced) return;

            if (canAutoOverwrite()) {
                sessionInput.value = detected;
                sessionStorage.setItem('deepseek_api_test_last_session_id', detected);
                localStorage.setItem('deepseek_api_test_last_session_id', detected);
                if (resultBox && resultBox.value && !resultBox.value.startsWith('正在请求 API...')) {
                    resultBox.value = `已自动切换会话ID: ${detected} (${reason})\n\n` + resultBox.value;
                }
                log('实时同步会话ID', detected, reason);
                lastSynced = detected;
            }
        }

        const rawPushState = history.pushState;
        const rawReplaceState = history.replaceState;

        history.pushState = function () {
            const r = rawPushState.apply(this, arguments);
            setTimeout(() => syncNow('pushState'), 0);
            return r;
        };

        history.replaceState = function () {
            const r = rawReplaceState.apply(this, arguments);
            setTimeout(() => syncNow('replaceState'), 0);
            return r;
        };

        window.addEventListener('popstate', () => setTimeout(() => syncNow('popstate'), 0));
        window.addEventListener('hashchange', () => setTimeout(() => syncNow('hashchange'), 0));

        const observer = new MutationObserver(() => syncNow('mutation'));
        observer.observe(document.body, { childList: true, subtree: true });

        setInterval(() => syncNow('timer'), 800);
    }

    function installCaptureHooks() {
        if (window.__deepseekApiTestHooked) return;
        window.__deepseekApiTestHooked = true;

        const rawFetch = window.fetch;
        window.fetch = async function (...args) {
            try {
                const input = args[0];
                const init = args[1] || {};
                const url = typeof input === 'string' ? input : (input && input.url);
                if (url && isTargetUrl(url)) {
                    const mergedHeaders = {
                        ...parseHeadersObject(input && input.headers),
                        ...parseHeadersObject(init.headers)
                    };
                    capturedHeaders = sanitizeHeaders(mergedHeaders);
                    log('捕获到 fetch 请求头模板', capturedHeaders);
                }
            } catch (e) {
                log('fetch hook error', e);
            }
            return rawFetch.apply(this, args);
        };

        const rawOpen = XMLHttpRequest.prototype.open;
        const rawSetHeader = XMLHttpRequest.prototype.setRequestHeader;
        const rawSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url) {
            this.__apiTestUrl = url;
            this.__apiTestHeaders = {};
            return rawOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
            try {
                if (this.__apiTestHeaders) this.__apiTestHeaders[String(k)] = String(v);
            } catch (e) {
                // ignore
            }
            return rawSetHeader.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function (body) {
            try {
                if (this.__apiTestUrl && isTargetUrl(this.__apiTestUrl)) {
                    capturedHeaders = sanitizeHeaders(this.__apiTestHeaders || {});
                    log('捕获到 XHR 请求头模板', capturedHeaders, body || '');
                }
            } catch (e) {
                log('xhr hook error', e);
            }
            return rawSend.apply(this, arguments);
        };
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
            'text', 'content', 'message', 'msg', 'answer', 'question',
            'delta', 'display_text', 'value'
        ];

        directKeys.forEach((k) => {
            if (typeof node[k] === 'string') {
                const t = node[k].trim();
                if (t) bucket.push(t);
            }
        });

        Object.values(node).forEach((v) => extractText(v, bucket));
    }

    function guessRole(item) {
        const raw = String(
            item?.role || item?.sender_role || item?.author_role || item?.type || ''
        ).toUpperCase();

        if (raw === 'USER') return 'user';
        if (raw === 'ASSISTANT') return 'assistant';

        const low = raw.toLowerCase();
        if (low.includes('assistant') || low.includes('bot') || low.includes('ai')) return 'assistant';
        if (low.includes('user') || low.includes('human') || low.includes('question')) return 'user';

        if (item?.is_user === true || item?.from_user === true) return 'user';
        if (item?.is_assistant === true || item?.from_bot === true) return 'assistant';

        return 'assistant';
    }

    function parseStructuredMessages(resp) {
        const bizData = resp?.data?.biz_data;
        const chatMessages = Array.isArray(bizData?.chat_messages) ? bizData.chat_messages : [];

        if (!chatMessages.length) return [];

        return chatMessages.map((msg, idx) => {
            const fragments = Array.isArray(msg?.fragments) ? msg.fragments : [];
            const texts = [];

            fragments.forEach((frag) => {
                if (typeof frag?.content === 'string' && frag.content.trim()) {
                    texts.push(frag.content.trim());
                }
            });

            if (!texts.length) {
                extractText(msg, texts);
            }

            const uniq = Array.from(new Set(texts.map((s) => s.trim()).filter(Boolean)));

            return {
                index: idx + 1,
                id: String(msg?.message_id || idx + 1),
                role: guessRole(msg),
                text: uniq.join('\n\n').trim(),
                status: String(msg?.status || ''),
                parentId: msg?.parent_id == null ? '' : String(msg.parent_id)
            };
        }).filter((m) => m.text);
    }

    function pickMessageArray(resp) {
        const candidates = [
            resp?.data?.history_message_list,
            resp?.data?.messages,
            resp?.data?.list,
            resp?.history_message_list,
            resp?.messages,
            resp?.list,
            resp?.data?.items,
            resp?.items
        ];

        for (const c of candidates) {
            if (Array.isArray(c) && c.length) return c;
        }
        return [];
    }

    function parseMessages(resp) {
        const structured = parseStructuredMessages(resp);
        if (structured.length) return structured;

        const arr = pickMessageArray(resp);
        return arr.map((item, idx) => {
            const bucket = [];
            extractText(item, bucket);
            const uniq = Array.from(new Set(bucket.map((s) => s.trim()).filter(Boolean)));
            return {
                index: idx + 1,
                id: String(item?.message_id || item?.id || item?.msg_id || idx + 1),
                role: guessRole(item),
                text: uniq.join('\n\n').trim()
            };
        }).filter((m) => m.text);
    }

    function createRequestUrl(sessionId) {
        const u = new URL(API_PATH, location.origin);
        u.searchParams.set('chat_session_id', sessionId);
        return u.toString();
    }

    function renderResult(resultBox, parsed, rawJson) {
        const lines = [];
        const session = rawJson?.data?.biz_data?.chat_session;
        if (session?.id) {
            lines.push(`会话ID: ${session.id}`);
        }
        if (session?.title) {
            lines.push(`会话标题: ${session.title}`);
        }
        if (session?.current_message_id != null) {
            lines.push(`当前消息ID: ${session.current_message_id}`);
        }
        lines.push(`解析到消息: ${parsed.length} 条`);
        lines.push('');

        parsed.forEach((m) => {
            const ext = m.status ? ` | ${m.status}` : '';
            lines.push(`[${m.index}] ${m.role.toUpperCase()} | ${m.id}${ext}`);
            lines.push(m.text);
            lines.push('');
        });

        if (!parsed.length) {
            lines.push('未解析到文本消息，请查看下方原始 JSON。');
        }

        resultBox.value = lines.join('\n');
        const rawPre = document.getElementById('deepseek-api-test-raw');
        if (rawPre) rawPre.textContent = JSON.stringify(rawJson, null, 2);
    }

    function createPanel() {
        const panel = document.createElement('div');
        panel.id = 'deepseek-api-test-panel';
        const initialSessionId = detectSessionId();
        panel.innerHTML = `
            <div class="deepseek-api-test-title">DeepSeek API 测试</div>
            <div class="deepseek-api-test-row">
                <input id="deepseek-api-test-session" type="text" placeholder="chat_session_id" value="${initialSessionId}" />
                <button id="deepseek-api-test-run">测试获取</button>
            </div>
            <textarea id="deepseek-api-test-result" placeholder="这里显示解析结果"></textarea>
            <details>
                <summary>原始 JSON</summary>
                <pre id="deepseek-api-test-raw"></pre>
            </details>
        `;
        document.body.appendChild(panel);

        const runBtn = panel.querySelector('#deepseek-api-test-run');
        const sessionInput = panel.querySelector('#deepseek-api-test-session');
        const resultBox = panel.querySelector('#deepseek-api-test-result');

        installRealtimeSessionSync(sessionInput, resultBox);

        runBtn.onclick = async () => {
            const sessionId = String(sessionInput.value || '').trim() || detectSessionId();
            if (!sessionId) {
                alert('请先输入 chat_session_id');
                return;
            }

            sessionInput.value = sessionId;
            sessionStorage.setItem('deepseek_api_test_last_session_id', sessionId);
            localStorage.setItem('deepseek_api_test_last_session_id', sessionId);

            runBtn.disabled = true;
            runBtn.textContent = '请求中...';
            resultBox.value = '正在请求 API...';

            try {
                const url = createRequestUrl(sessionId);
                const resp = await fetch(url, {
                    method: 'GET',
                    credentials: 'include',
                    headers: sanitizeHeaders(capturedHeaders || {})
                });

                const text = await resp.text();
                const json = safeParseJson(text);

                if (!resp.ok) {
                    resultBox.value = `请求失败: HTTP ${resp.status}\n\n${text.slice(0, 1200)}`;
                    return;
                }

                if (!json) {
                    resultBox.value = `响应不是合法 JSON:\n\n${text.slice(0, 1200)}`;
                    return;
                }

                const parsed = parseMessages(json);
                renderResult(resultBox, parsed, json);
            } catch (e) {
                resultBox.value = `请求异常: ${e && e.message ? e.message : e}`;
            } finally {
                runBtn.disabled = false;
                runBtn.textContent = '测试获取';
            }
        };
    }

    GM_addStyle(`
        #deepseek-api-test-panel {
            position: fixed;
            right: 18px;
            bottom: 18px;
            width: 420px;
            max-height: 72vh;
            background: rgba(255,255,255,0.98);
            border: 1px solid #e5e7eb;
            border-radius: 12px;
            box-shadow: 0 10px 28px rgba(0,0,0,0.18);
            z-index: 999999;
            padding: 12px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            font-family: "Microsoft YaHei", sans-serif;
        }
        .deepseek-api-test-title {
            font-size: 14px;
            font-weight: 700;
            color: #111827;
        }
        .deepseek-api-test-row {
            display: flex;
            gap: 8px;
        }
        #deepseek-api-test-session {
            flex: 1;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            padding: 6px 8px;
            font-size: 12px;
        }
        #deepseek-api-test-run {
            border: none;
            border-radius: 8px;
            padding: 6px 10px;
            font-size: 12px;
            font-weight: 700;
            color: #fff;
            background: #2563eb;
            cursor: pointer;
        }
        #deepseek-api-test-run:disabled {
            background: #9ca3af;
            cursor: not-allowed;
        }
        #deepseek-api-test-result {
            width: 100%;
            min-height: 160px;
            max-height: 280px;
            resize: vertical;
            border: 1px solid #d1d5db;
            border-radius: 8px;
            padding: 8px;
            font-size: 12px;
            line-height: 1.5;
            color: #111827;
            box-sizing: border-box;
        }
        #deepseek-api-test-panel details {
            border-top: 1px dashed #d1d5db;
            padding-top: 6px;
        }
        #deepseek-api-test-panel summary {
            font-size: 12px;
            cursor: pointer;
            color: #374151;
        }
        #deepseek-api-test-raw {
            max-height: 220px;
            overflow: auto;
            background: #0f172a;
            color: #e2e8f0;
            border-radius: 8px;
            padding: 8px;
            font-size: 11px;
            line-height: 1.4;
            margin: 6px 0 0;
            white-space: pre-wrap;
            word-break: break-all;
        }
    `);

    installCaptureHooks();
    createPanel();
    log('DeepSeek API 测试脚本已启动');
})();
