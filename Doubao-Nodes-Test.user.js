// ==UserScript==
// @name         Doubao Nodes Test
// @namespace    https://example.com/
// @version      0.3.0
// @description  仅用于测试豆包节点信息：API 获取用户节点 + DOM 定位用户节点
// @match        *://www.doubao.com/chat/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const DEFAULT_QUERY_BASE = 'version_code=20800&language=zh&device_platform=web&aid=497858&real_aid=497858&pkg_type=release_version&device_id=7571732726702835209&pc_version=3.12.3&web_id=7572300776296236571&tea_uuid=7572300776296236571&region=CN&sys_region=CN&samantha_web=1&use-olympus-account=1';

    const host = window.location.hostname;
    const path = window.location.pathname;
    const isDoubao = /^www\.doubao\.com$/i.test(host) && /^\/chat\/\d+\/?$/i.test(path);
    if (!isDoubao) return;

    let capturedTemplate = null;
    let capturedRecentConvUrl = '';
    let captureInstalled = false;
    let apiNodes = [];
    let domNodes = [];
    let lastApiFetchStats = [];

    function normalizeText(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim();
    }

    function shortText(text, n = 80) {
        const t = normalizeText(text);
        return t.length > n ? `${t.slice(0, n)}...` : t;
    }

    function parseHeadersObject(input) {
        if (!input) return {};
        if (input instanceof Headers) {
            const out = {};
            input.forEach((v, k) => out[String(k).toLowerCase()] = String(v));
            return out;
        }
        if (Array.isArray(input)) {
            const out = {};
            input.forEach((pair) => {
                if (!Array.isArray(pair) || pair.length < 2) return;
                out[String(pair[0]).toLowerCase()] = String(pair[1]);
            });
            return out;
        }
        if (typeof input === 'object') {
            const out = {};
            Object.entries(input).forEach(([k, v]) => out[String(k).toLowerCase()] = String(v));
            return out;
        }
        return {};
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

    function safeParseJson(text) {
        try { return JSON.parse(text); } catch (_) { return null; }
    }

    function parseBoolLike(value) {
        if (typeof value === 'boolean') return value;
        if (typeof value === 'number') return value !== 0;
        const s = String(value == null ? '' : value).trim().toLowerCase();
        if (!s) return false;
        if (s === '0' || s === 'false' || s === 'no' || s === 'off' || s === 'null') return false;
        return true;
    }

    function getConversationIdFromUrl() {
        const m = String(window.location.pathname || '').match(/\/chat\/(\d+)/i);
        return m ? String(m[1]) : '';
    }

    function createUuid() {
        if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function rememberWebTabId(id) {
        const tabId = String(id || '').trim();
        if (!tabId) return '';
        sessionStorage.setItem('db_nodes_test_web_tab_id', tabId);
        return tabId;
    }

    function getWebTabIdFromUrl(rawUrl) {
        try {
            const u = new URL(rawUrl, window.location.origin);
            return String(u.searchParams.get('web_tab_id') || '').trim();
        } catch (_) {
            return '';
        }
    }

    function getWebTabIdCandidates(customUrl = '') {
        const out = [];
        const seen = new Set();
        const push = (value) => {
            const id = String(value || '').trim();
            if (!id || seen.has(id)) return;
            seen.add(id);
            out.push(id);
        };

        push(getWebTabIdFromUrl(customUrl));
        push(getWebTabIdFromUrl(window.location.href));
        push(getWebTabIdFromUrl(capturedRecentConvUrl));
        push(getWebTabIdFromUrl(capturedTemplate?.url || ''));
        push(sessionStorage.getItem('db_nodes_test_web_tab_id') || '');

        if (!out.length) push(createUuid());
        return out;
    }

    function getOrCreateWebTabId() {
        const candidates = getWebTabIdCandidates(capturedTemplate?.url || '');
        return rememberWebTabId(candidates[0] || createUuid());
    }

    function ensureChainSingleQuery(rawUrl) {
        const u = new URL(rawUrl, window.location.origin);
        const defaults = new URLSearchParams(DEFAULT_QUERY_BASE);
        defaults.forEach((v, k) => {
            if (!u.searchParams.has(k)) u.searchParams.set(k, v);
        });
        if (!u.searchParams.get('web_tab_id')) {
            u.searchParams.set('web_tab_id', getOrCreateWebTabId());
        }
        return u.toString();
    }

    function isSingleChainUrl(rawUrl) {
        try {
            const u = new URL(rawUrl, window.location.origin);
            return /\/im\/chain\/single/i.test(u.pathname);
        } catch (_) {
            return false;
        }
    }

    function installCaptureHooks() {
        if (captureInstalled) return;
        captureInstalled = true;

        const rawFetch = window.fetch;
        window.fetch = function (input, init) {
            try {
                const inputUrl = typeof input === 'string' ? input : input?.url;
                const url = inputUrl ? new URL(inputUrl, window.location.origin).toString() : '';
                const method = String(init?.method || (typeof input !== 'string' ? input?.method : '') || 'GET').toUpperCase();
                if (url && method === 'POST' && isSingleChainUrl(url)) {
                    let bodyText = '';
                    const body = init?.body;
                    if (typeof body === 'string') bodyText = body;
                    capturedTemplate = {
                        url,
                        method,
                        headers: sanitizeHeaders({
                            ...parseHeadersObject(typeof input !== 'string' ? input?.headers : null),
                            ...parseHeadersObject(init?.headers)
                        }),
                        body: bodyText || ''
                    };
                }
                if (url && /\/im\/chain\/recent_conv/i.test(url)) {
                    capturedRecentConvUrl = String(url || '');
                    const tabId = getWebTabIdFromUrl(url);
                    if (tabId) rememberWebTabId(tabId);
                }
            } catch (_) {}
            return rawFetch.apply(this, arguments);
        };

        const nativeOpen = XMLHttpRequest.prototype.open;
        const nativeSend = XMLHttpRequest.prototype.send;
        const nativeSetHeader = XMLHttpRequest.prototype.setRequestHeader;

        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this.__dbMethod = method;
            this.__dbUrl = url;
            this.__dbHeaders = {};
            return nativeOpen.call(this, method, url, ...rest);
        };

        XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
            if (this.__dbHeaders) this.__dbHeaders[String(name).toLowerCase()] = String(value);
            return nativeSetHeader.call(this, name, value);
        };

        XMLHttpRequest.prototype.send = function (body) {
            try {
                const fullUrl = this.__dbUrl ? new URL(this.__dbUrl, window.location.origin).toString() : '';
                const method = String(this.__dbMethod || 'GET').toUpperCase();
                if (fullUrl && method === 'POST' && isSingleChainUrl(fullUrl)) {
                    capturedTemplate = {
                        url: fullUrl,
                        method,
                        headers: sanitizeHeaders(this.__dbHeaders || {}),
                        body: typeof body === 'string' ? body : ''
                    };
                }
                if (fullUrl && /\/im\/chain\/recent_conv/i.test(fullUrl)) {
                    capturedRecentConvUrl = fullUrl;
                    const tabId = getWebTabIdFromUrl(fullUrl);
                    if (tabId) rememberWebTabId(tabId);
                }
            } catch (_) {}
            return nativeSend.call(this, body);
        };
    }

    function deepReplaceConvId(value, convId) {
        if (value == null) return value;
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return value.map((v) => deepReplaceConvId(v, convId));
        if (typeof value === 'object') {
            const out = {};
            Object.entries(value).forEach(([k, v]) => {
                const key = String(k).toLowerCase();
                if (key === 'conversation_id' || key === 'conv_id' || key === 'chat_id' || key === 'section_id') {
                    out[k] = convId;
                } else {
                    out[k] = deepReplaceConvId(v, convId);
                }
            });
            return out;
        }
        return value;
    }

    function buildDefaultRequest(convId) {
        return {
            url: ensureChainSingleQuery(`${window.location.origin}/im/chain/single`),
            headers: {
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json; encoding=utf-8',
                'agw-js-conv': 'str'
            },
            body: {
                cmd: 3100,
                uplink_body: {
                    pull_singe_chain_uplink_body: {
                        conversation_id: convId,
                        anchor_index: 9007199254740991,
                        conversation_type: '0',
                        direction: 1,
                        limit: 50,
                        ext: {},
                        filter: { index_list: [] }
                    }
                },
                sequence_id: createUuid(),
                channel: 2,
                version: '1'
            }
        };
    }

    function buildRequest(convId, msgCursor = '', anchorIndex = null) {
        const fallback = buildDefaultRequest(convId);
        let bodyObj = null;
        if (capturedTemplate && capturedTemplate.body) {
            const parsed = safeParseJson(capturedTemplate.body);
            bodyObj = parsed ? deepReplaceConvId(parsed, convId) : null;
        }
        if (!bodyObj) bodyObj = fallback.body;
        if (!bodyObj.uplink_body || typeof bodyObj.uplink_body !== 'object') {
            bodyObj.uplink_body = {};
        }
        if (!bodyObj.uplink_body.pull_singe_chain_uplink_body || typeof bodyObj.uplink_body.pull_singe_chain_uplink_body !== 'object') {
            bodyObj.uplink_body.pull_singe_chain_uplink_body = {};
        }
        const pull = bodyObj.uplink_body.pull_singe_chain_uplink_body;
        pull.conversation_id = convId;
        pull.limit = Number(pull.limit || 50) || 50;
        if (msgCursor) pull.msg_cursor = String(msgCursor);
        else if ('msg_cursor' in pull) delete pull.msg_cursor;
        if (anchorIndex != null && Number.isFinite(Number(anchorIndex))) {
            pull.anchor_index = Number(anchorIndex);
        }
        bodyObj.sequence_id = createUuid();
        const url = ensureChainSingleQuery(capturedTemplate?.url || fallback.url);
        const headers = sanitizeHeaders({
            ...(capturedTemplate?.headers || {}),
            ...fallback.headers
        });
        return { url, headers, body: bodyObj };
    }

    function parseMessagesFromResponse(respJson) {
        const payload = respJson?.downlink_body?.pull_singe_chain_downlink_body;
        const messages = Array.isArray(payload?.messages) ? payload.messages : [];

        function isTrivialSkillPrompt(text) {
            const t = normalizeText(text);
            if (!t) return true;
            if (/^翻译为\s*english$/i.test(t)) return true;
            if (/^translate\s+to\s+english$/i.test(t)) return true;
            if (/^翻译$/i.test(t)) return true;
            return false;
        }

        function normalizeUserText(text) {
            const lines = String(text || '')
                .split(/\r?\n/)
                .map((line) => normalizeText(line))
                .filter(Boolean)
                .filter((line) => !isTrivialSkillPrompt(line));
            return Array.from(new Set(lines)).join('\n').trim();
        }

        function extractTextFromContentField(rawContent) {
            if (typeof rawContent !== 'string') return '';
            const t = rawContent.trim();
            if (!t) return '';
            try {
                const parsed = JSON.parse(t);
                if (typeof parsed?.text === 'string' && parsed.text.trim()) {
                    return normalizeUserText(parsed.text);
                }
            } catch (_) {
                // non-json content
            }
            return normalizeUserText(t);
        }

        function collectTextFromBlock(block) {
            const lines = [];
            function pushText(text) {
                const t = normalizeUserText(text);
                if (t) lines.push(t);
            }

            function walk(node) {
                if (node == null) return;
                if (typeof node === 'string') {
                    pushText(node);
                    return;
                }
                if (Array.isArray(node)) {
                    node.forEach(walk);
                    return;
                }
                if (typeof node !== 'object') return;

                const candidates = [
                    node?.content?.text_block?.text,
                    node?.content?.reference_block?.text?.text,
                    node?.content?.reference_block?.text,
                    node?.text,
                    node?.content?.text,
                    node?.content
                ];
                candidates.forEach((c) => {
                    if (typeof c === 'string') pushText(c);
                });

                Object.entries(node).forEach(([k, v]) => {
                    if (!v || typeof v !== 'object') return;
                    if (k === 'meta_info' || k === 'append_fields') return;
                    walk(v);
                });
            }

            walk(block);
            return Array.from(new Set(lines)).join('\n').trim();
        }

        const parsed = messages.map((m) => {
            const role = Number(m?.user_type) === 1 ? 'user' : 'assistant';
            const blockText = normalizeUserText(
                (Array.isArray(m?.content_block) ? m.content_block : [])
                    .map((b) => collectTextFromBlock(b))
                    .filter(Boolean)
                    .join('\n\n')
            );
            const contentText = extractTextFromContentField(m?.content || '');
            const ttsText = normalizeUserText(m?.tts_content || '');
            const text = normalizeUserText(blockText || contentText || ttsText);
            return {
                id: m?.message_id || '',
                role,
                index: Number(m?.index_in_conv || 0),
                text
            };
        }).filter((m) => m.text);
        parsed.sort((a, b) => a.index - b.index);
        return parsed;
    }

    async function fetchApiNodes() {
        const convId = getConversationIdFromUrl();
        if (!convId) throw new Error('未从 URL 解析到会话 ID');

        const hasCapturedTemplate = Boolean(capturedTemplate && capturedTemplate.url);
        const seen = new Set();
        const merged = [];
        const stats = [];
        let msgCursor = '';
        let anchorIndex = null;
        let page = 0;
        const maxPages = 60;
        let lastPageSignature = '';

        while (page < maxPages) {
            page += 1;
            const req = buildRequest(convId, msgCursor, anchorIndex);
            const resp = await fetch(req.url, {
                method: 'POST',
                credentials: 'include',
                headers: req.headers,
                body: JSON.stringify(req.body)
            });
            if (!resp.ok) {
                throw new Error(`API 请求失败: ${resp.status}`);
            }

            const raw = await resp.text();
            const json = safeParseJson(raw);
            if (!json) throw new Error('API 返回非 JSON');

            const parsedPageMessages = parseMessagesFromResponse(json);
            const pageNodes = parsedPageMessages
                .filter((m) => m.role === 'user')
                .map((m, i) => ({
                    id: `api-user-${m.id || `${page}-${i + 1}`}`,
                    text: normalizeText(m.text),
                    sourceMessageId: String(m.id || `${page}-${i + 1}`),
                    index: Number(m.index || 0)
                }));

            let addedCount = 0;
            pageNodes.forEach((n) => {
                const key = String(n.sourceMessageId || '').trim() || `${n.index}::${n.text.slice(0, 64)}`;
                if (seen.has(key)) return;
                seen.add(key);
                merged.push(n);
                addedCount += 1;
            });

            const payload = json?.downlink_body?.pull_singe_chain_downlink_body || {};
            const hasMore = parseBoolLike(payload.has_more);
            const nextCursor = String(payload.msg_cursor || '').trim();
            const nextIndexRaw = payload.next_index;
            const nextIndex = Number(nextIndexRaw);
            const hasValidNextIndex = Number.isFinite(nextIndex) && nextIndex > 0;
            const indexes = parsedPageMessages
                .map((m) => Number(m.index || 0))
                .filter((v) => Number.isFinite(v) && v > 0);
            const minIndexInPage = indexes.length ? Math.min(...indexes) : 0;
            const computedNextAnchor = minIndexInPage > 1 ? (minIndexInPage - 1) : 0;

            const firstId = String(parsedPageMessages[0]?.id || '').trim();
            const lastId = String(parsedPageMessages[parsedPageMessages.length - 1]?.id || '').trim();
            const pageSignature = `${firstId}|${lastId}|${parsedPageMessages.length}`;

            stats.push({
                page,
                count: parsedPageMessages.length,
                added: addedCount,
                hasMore: hasMore ? 1 : 0,
                nextCursor: nextCursor ? 'Y' : 'N',
                nextIndex: hasValidNextIndex ? String(nextIndex) : '-',
                minIndex: minIndexInPage || '-'
            });

            if (!hasMore) break;

            if (pageSignature && pageSignature === lastPageSignature) break;
            lastPageSignature = pageSignature;

            if (nextCursor) {
                if (nextCursor === msgCursor) {
                    // cursor 未推进时，尝试退回 anchor_index 模式继续翻页
                    if (hasValidNextIndex && nextIndex !== Number(anchorIndex)) {
                        anchorIndex = nextIndex;
                        msgCursor = '';
                        continue;
                    }
                    if (computedNextAnchor > 0 && computedNextAnchor !== Number(anchorIndex)) {
                        anchorIndex = computedNextAnchor;
                        msgCursor = '';
                        continue;
                    }
                    break;
                }
                msgCursor = nextCursor;
                if (hasValidNextIndex) anchorIndex = nextIndex;
                continue;
            }

            if (hasValidNextIndex) {
                if (nextIndex === Number(anchorIndex)) break;
                anchorIndex = nextIndex;
                continue;
            }

            if (computedNextAnchor > 0 && computedNextAnchor !== Number(anchorIndex)) {
                anchorIndex = computedNextAnchor;
                continue;
            }

            break;
        }

        lastApiFetchStats = stats;
        apiNodes = merged
            .sort((a, b) => a.index - b.index)
            .map(({ id, text, sourceMessageId }) => ({ id, text, sourceMessageId }));

        if (!apiNodes.length && !hasCapturedTemplate) {
            throw new Error('API 返回为空。当前未捕获到 /im/chain/single 模板，请先在豆包发送一条新消息后重试。');
        }
        return apiNodes;
    }

    function getDomRows() {
        const rows = Array.from(document.querySelectorAll('[data-testid="send_message"], [data-testid="receive_message"]'));
        rows.sort((a, b) => {
            if (a === b) return 0;
            const pos = a.compareDocumentPosition(b);
            if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
        });
        return rows;
    }

    function extractUserTextFromSendRow(row) {
        if (!row) return '';

        // 豆包新版结构中，用户原文经常在引用块里；message_text_content 可能只是“翻译为 English”等技能指令。
        const refText = normalizeText(row.querySelector('[data-testid="ref-content"]')?.innerText || '');
        const plainText = normalizeText(row.querySelector('[data-testid="message_text_content"]')?.innerText || '');
        const fullText = normalizeText(row.querySelector('[data-testid="message_content"]')?.innerText || '');

        const isTrivialSkillPrompt = (text) => {
            const t = normalizeText(text);
            if (!t) return true;
            if (/^翻译为\s*english$/i.test(t)) return true;
            if (/^translate\s+to\s+english$/i.test(t)) return true;
            if (/^翻译$/i.test(t)) return true;
            return false;
        };

        if (refText && !isTrivialSkillPrompt(refText)) return refText;
        if (fullText && !isTrivialSkillPrompt(fullText)) return fullText;
        if (plainText && !isTrivialSkillPrompt(plainText)) return plainText;
        return refText || fullText || plainText || '';
    }

    function scanDomNodes() {
        const out = [];
        const seen = new Set();
        getDomRows().forEach((row, idx) => {
            const testId = String(row.getAttribute('data-testid') || '').toLowerCase();
            if (testId !== 'send_message') return;
            const text = extractUserTextFromSendRow(row);
            if (!text) return;
            const messageId = String(row.querySelector('[data-testid="message_content"]')?.getAttribute('data-message-id') || '').trim();
            const rid = String(row.getAttribute('data-id') || messageId || `dom-user-${idx + 1}`);
            const key = `${rid}::${text.slice(0, 80)}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push({
                id: `dom-user-${rid}`,
                rowId: rid,
                text,
                element: row.querySelector('[data-testid="message_content"]') || row
            });
        });
        domNodes = out;
        return domNodes;
    }

    function locateDomElementByApiNode(apiNode) {
        if (!apiNode || !apiNode.text) return null;
        const targetId = String(apiNode.sourceMessageId || apiNode.id || '').trim();
        if (targetId) {
            const byId = domNodes.find((n) => String(n.rowId || '').trim() === targetId);
            if (byId) return byId;
        }

        const targetText = normalizeText(apiNode.text);
        const prefix = targetText.slice(0, Math.min(48, targetText.length));
        const middle = targetText.slice(Math.max(0, Math.floor(targetText.length / 2) - 18), Math.floor(targetText.length / 2) + 18);

        let best = null;
        let bestScore = -1;
        domNodes.forEach((n) => {
            const txt = n.text;
            let score = 0;
            if (txt === targetText) score += 14;
            if (prefix && txt.includes(prefix)) score += 8;
            if (middle && txt.includes(middle)) score += 4;
            if (targetText.includes(txt.slice(0, Math.min(24, txt.length)))) score += 3;
            if (score > bestScore) {
                bestScore = score;
                best = n;
            }
        });
        return bestScore >= 8 ? best : null;
    }

    function calcMatchReport() {
        if (!domNodes.length) scanDomNodes();
        const rows = apiNodes.map((a, i) => {
            const located = locateDomElementByApiNode(a);
            return {
                idx: i + 1,
                apiId: a.sourceMessageId || a.id,
                apiText: shortText(a.text, 60),
                matched: Boolean(located),
                domId: located ? located.rowId : '',
                domText: located ? shortText(located.text, 60) : ''
            };
        });
        const matchedCount = rows.filter((r) => r.matched).length;
        return { rows, matchedCount, total: rows.length };
    }

    function highlightDomNode(domNode) {
        if (!domNode?.element) return;
        const el = domNode.element;
        const prev = el.style.outline;
        const prevOffset = el.style.outlineOffset;
        el.style.outline = '2px solid #2563eb';
        el.style.outlineOffset = '2px';
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
            el.style.outline = prev;
            el.style.outlineOffset = prevOffset;
        }, 1500);
    }

    function mountPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = [
            'position:fixed',
            'right:16px',
            'bottom:16px',
            'z-index:2147483647',
            'width:420px',
            'max-height:70vh',
            'background:#0f172a',
            'color:#e2e8f0',
            'border:1px solid #334155',
            'border-radius:10px',
            'box-shadow:0 10px 30px rgba(2,6,23,.45)',
            'font:12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            'display:flex',
            'flex-direction:column'
        ].join(';');

        panel.innerHTML = `
            <div style="padding:10px 12px;border-bottom:1px solid #334155;display:flex;justify-content:space-between;align-items:center;">
                <strong>Doubao Nodes Test</strong>
                <span id="db-test-status" style="color:#93c5fd;">idle</span>
            </div>
            <div style="padding:10px 12px;display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid #334155;">
                <button id="db-test-api" style="padding:6px 10px;border:1px solid #475569;border-radius:6px;background:#111827;color:#e2e8f0;cursor:pointer;">API 节点</button>
                <button id="db-test-dom" style="padding:6px 10px;border:1px solid #475569;border-radius:6px;background:#111827;color:#e2e8f0;cursor:pointer;">DOM 节点</button>
                <button id="db-test-match" style="padding:6px 10px;border:1px solid #475569;border-radius:6px;background:#111827;color:#e2e8f0;cursor:pointer;">匹配报告</button>
                <button id="db-test-jump" style="padding:6px 10px;border:1px solid #475569;border-radius:6px;background:#111827;color:#e2e8f0;cursor:pointer;">定位首个未匹配</button>
            </div>
            <pre id="db-test-output" style="margin:0;padding:10px 12px;overflow:auto;white-space:pre-wrap;word-break:break-word;flex:1;"></pre>
        `;

        const statusEl = panel.querySelector('#db-test-status');
        const outputEl = panel.querySelector('#db-test-output');
        const setStatus = (s) => { statusEl.textContent = s; };
        const print = (text) => { outputEl.textContent = text; };

        panel.querySelector('#db-test-api').addEventListener('click', async () => {
            setStatus('fetch-api');
            try {
                const list = await fetchApiNodes();
                const statLines = lastApiFetchStats.map((s) =>
                    `p${s.page}: total=${s.count}, added=${s.added}, hasMore=${s.hasMore}, cursor=${s.nextCursor}, nextIndex=${s.nextIndex}, minIndex=${s.minIndex}`
                );
                print([
                    `API 用户节点: ${list.length}`,
                    `分页请求: ${lastApiFetchStats.length} 页`,
                    '',
                    ...statLines,
                    '',
                    ...list.map((n, i) => `[${i + 1}] id=${n.sourceMessageId || n.id}\n${shortText(n.text, 140)}`)
                ].join('\n'));
                setStatus('api-ok');
            } catch (e) {
                print(`API 节点获取失败: ${String(e?.message || e)}`);
                setStatus('api-fail');
            }
        });

        panel.querySelector('#db-test-dom').addEventListener('click', () => {
            setStatus('scan-dom');
            const list = scanDomNodes();
            print([
                `DOM 用户节点: ${list.length}`,
                '',
                ...list.map((n, i) => `[${i + 1}] rowId=${n.rowId}\n${shortText(n.text, 140)}`)
            ].join('\n'));
            setStatus('dom-ok');
        });

        panel.querySelector('#db-test-match').addEventListener('click', async () => {
            setStatus('match');
            try {
                if (!apiNodes.length) await fetchApiNodes();
                if (!domNodes.length) scanDomNodes();
                const report = calcMatchReport();
                print([
                    `匹配结果: ${report.matchedCount}/${report.total}`,
                    '',
                    ...report.rows.map((r) => `[${r.idx}] ${r.matched ? 'OK ' : 'MISS'} api=${r.apiId} dom=${r.domId || '-'}\napiText=${r.apiText}\ndomText=${r.domText || '-'}`)
                ].join('\n'));
                setStatus('match-ok');
            } catch (e) {
                print(`生成匹配报告失败: ${String(e?.message || e)}`);
                setStatus('match-fail');
            }
        });

        panel.querySelector('#db-test-jump').addEventListener('click', async () => {
            setStatus('locate');
            try {
                if (!apiNodes.length) await fetchApiNodes();
                if (!domNodes.length) scanDomNodes();
                const report = calcMatchReport();
                const miss = report.rows.find((r) => !r.matched);
                if (!miss) {
                    print('全部 API 用户节点都匹配到了 DOM 节点。');
                    setStatus('locate-ok');
                    return;
                }
                const apiNode = apiNodes[miss.idx - 1];
                const nearest = locateDomElementByApiNode(apiNode);
                if (nearest) {
                    highlightDomNode(nearest);
                    print(`发现未精确匹配节点，已定位最接近 DOM 行: rowId=${nearest.rowId}\n${shortText(nearest.text, 160)}`);
                } else {
                    print(`未匹配且无法定位近似 DOM 行: api=${miss.apiId}\n${miss.apiText}`);
                }
                setStatus('locate-done');
            } catch (e) {
                print(`定位失败: ${String(e?.message || e)}`);
                setStatus('locate-fail');
            }
        });

        document.body.appendChild(panel);
        print('准备就绪。\n先点击“API 节点”再点“匹配报告”。');
    }

    installCaptureHooks();
    if (document.body) mountPanel();
    else document.addEventListener('DOMContentLoaded', mountPanel, { once: true });
})();
