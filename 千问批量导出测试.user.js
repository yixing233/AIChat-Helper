// ==UserScript==
// @name         千问批量导出测试
// @namespace    http://tampermonkey.net/
// @version      0.1.0
// @description  在千问页面测试会话列表接口 /api/v2/session/page/list，并批量导出选中会话
// @author       xchengb
// @match        *://*.qianwen.com/*
// @match        *://tongyi.aliyun.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const PAGE_LIST_PATH = '/api/v2/session/page/list';
    const MSG_LIST_PATH = '/api/v1/session/msg/list';
    const PAGE_LIST_DEFAULT_URL = 'https://chat2-api.qianwen.com/api/v2/session/page/list?biz_id=ai_qwen&chat_client=h5&device=pc&fr=pc&pr=qwen&la=zh-CN&tz=Asia%2FShanghai';
    const MSG_LIST_DEFAULT_URL = 'https://chat2-api.qianwen.com/api/v1/session/msg/list?return_response_messages=true&biz_id=ai_qwen&event_filter=all&page_size=50&chat_client=h5&device=pc&fr=pc&pr=qwen&la=zh-CN&tz=Asia%2FShanghai';

    let capturedPageListTemplate = null;
    let capturedMsgListTemplate = null;

    function log() {
        console.log('[Qwen-Batch-Test]', ...arguments);
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
            headersLike.forEach((v, k) => {
                out[String(k)] = String(v);
            });
            return out;
        }
        if (Array.isArray(headersLike)) {
            const out = {};
            headersLike.forEach((pair) => {
                if (!Array.isArray(pair) || pair.length < 2) return;
                out[String(pair[0])] = String(pair[1]);
            });
            return out;
        }
        if (typeof headersLike === 'object') return { ...headersLike };
        return {};
    }

    function sanitizeHeaders(headersObj, allowContentType) {
        const blocked = new Set([
            'cookie', 'host', 'origin', 'referer', 'content-length',
            'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest',
            'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
            'accept-encoding', 'connection', ':authority', ':method', ':path', ':scheme'
        ]);
        const out = {};
        Object.entries(headersObj || {}).forEach(([k, v]) => {
            const key = String(k).toLowerCase();
            if (blocked.has(key)) return;
            if (!allowContentType && key === 'content-type') return;
            if (v == null || v === '') return;
            out[key] = String(v);
        });
        return out;
    }

    function createNonce(len) {
        const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
        let out = '';
        for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
        return out;
    }

    function getCookieValue(name) {
        try {
            const escaped = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const match = String(document.cookie || '').match(new RegExp(`(?:^|;\\s*)${escaped}=([^;]*)`));
            return match ? decodeURIComponent(match[1]) : '';
        } catch (e) {
            return '';
        }
    }

    function createFallbackUt() {
        try {
            if (window.crypto && typeof window.crypto.randomUUID === 'function') {
                return window.crypto.randomUUID();
            }
        } catch (e) {
            // ignore
        }
        return [createNonce(8), createNonce(4), createNonce(4), createNonce(4), createNonce(12)].join('-');
    }

    function getUtFromPage() {
        const templates = [capturedPageListTemplate, capturedMsgListTemplate];
        for (const tpl of templates) {
            try {
                if (!tpl?.url) continue;
                const u = new URL(tpl.url, location.origin);
                const ut = (u.searchParams.get('ut') || '').trim();
                if (ut) return ut;
            } catch (e) {
                // ignore
            }
            try {
                const headers = parseHeadersObject(tpl?.headers);
                const lower = {};
                Object.entries(headers).forEach(([k, v]) => {
                    lower[String(k).toLowerCase()] = String(v);
                });
                const headerUt = lower['x-deviceid'] || lower['x-qwen-ut'] || lower.ut;
                if (headerUt) return headerUt;
            } catch (e) {
                // ignore
            }
        }

        const tryKeys = ['ut', 'x-qwen-ut', 'qwen-ut', 'qwen_ut', 'deviceId', 'device_id', 'utdid'];
        for (const k of tryKeys) {
            const fromLocal = localStorage.getItem(k);
            if (fromLocal) return String(fromLocal);
            const fromSession = sessionStorage.getItem(k);
            if (fromSession) return String(fromSession);
        }

        const fromCookies = [
            getCookieValue('ut'),
            getCookieValue('qwen_ut'),
            getCookieValue('deviceId'),
            getCookieValue('device_id'),
            getCookieValue('x-deviceid')
        ].find(Boolean);
        if (fromCookies) return String(fromCookies);

        const key = 'ai-chat-nodes-qwen-batch-fallback-ut';
        try {
            const stored = localStorage.getItem(key);
            if (stored) return String(stored);
            const created = createFallbackUt();
            localStorage.setItem(key, created);
            return created;
        } catch (e) {
            return createFallbackUt();
        }
    }

    function buildBaseHeaders(extraHeaders, allowContentType) {
        const headers = sanitizeHeaders({
            ...(parseHeadersObject(capturedPageListTemplate?.headers)),
            ...(parseHeadersObject(capturedMsgListTemplate?.headers)),
            ...(parseHeadersObject(extraHeaders)),
            accept: '*/*'
        }, allowContentType);

        const xsrfToken = getCookieValue('XSRF-TOKEN');
        if (xsrfToken && !headers['x-xsrf-token']) headers['x-xsrf-token'] = xsrfToken;

        const ut = getUtFromPage();
        if (ut && !headers['x-deviceid']) headers['x-deviceid'] = ut;

        if (!headers['x-platform']) headers['x-platform'] = 'pc_tongyi';
        if (allowContentType && !headers['content-type']) headers['content-type'] = 'application/json';
        return headers;
    }

    function ensureApiUrl(baseUrl, path, extraParams) {
        const fallback = path === PAGE_LIST_PATH ? PAGE_LIST_DEFAULT_URL : MSG_LIST_DEFAULT_URL;
        const u = new URL(baseUrl || fallback, location.origin);
        u.hostname = 'chat2-api.qianwen.com';
        u.pathname = path;
        const defaults = {
            biz_id: 'ai_qwen',
            chat_client: 'h5',
            device: 'pc',
            fr: 'pc',
            pr: 'qwen',
            la: 'zh-CN',
            tz: 'Asia/Shanghai'
        };
        Object.entries(defaults).forEach(([k, v]) => u.searchParams.set(k, v));
        const ut = getUtFromPage();
        if (ut) u.searchParams.set('ut', ut);
        Object.entries(extraParams || {}).forEach(([k, v]) => {
            if (v == null || v === '') return;
            u.searchParams.set(k, String(v));
        });
        if (path === MSG_LIST_PATH) {
            if (!u.searchParams.get('return_response_messages')) u.searchParams.set('return_response_messages', 'true');
            if (!u.searchParams.get('event_filter')) u.searchParams.set('event_filter', 'all');
            if (!u.searchParams.get('page_size')) u.searchParams.set('page_size', '50');
            u.searchParams.set('nonce', createNonce(11));
            u.searchParams.set('timestamp', String(Date.now()));
        }
        return u.toString();
    }

    function isPageListUrl(rawUrl) {
        try {
            return new URL(rawUrl, location.origin).pathname.includes(PAGE_LIST_PATH);
        } catch (e) {
            return false;
        }
    }

    function isMsgListUrl(rawUrl) {
        try {
            return new URL(rawUrl, location.origin).pathname.includes(MSG_LIST_PATH);
        } catch (e) {
            return false;
        }
    }

    function captureTemplate(url, headers, body) {
        if (isPageListUrl(url)) {
            capturedPageListTemplate = { url, headers: parseHeadersObject(headers), body: typeof body === 'string' ? body : '' };
        }
        if (isMsgListUrl(url)) {
            capturedMsgListTemplate = { url, headers: parseHeadersObject(headers), body: typeof body === 'string' ? body : '' };
        }
    }

    function installHooks() {
        const nativeFetch = window.fetch;
        window.fetch = function (input, init) {
            try {
                const url = typeof input === 'string' ? input : input?.url;
                if (url && (isPageListUrl(url) || isMsgListUrl(url))) {
                    captureTemplate(url, init?.headers || input?.headers, init?.body || input?.body);
                }
            } catch (e) {
                // ignore
            }
            return nativeFetch.apply(this, arguments);
        };

        const nativeOpen = XMLHttpRequest.prototype.open;
        const nativeSend = XMLHttpRequest.prototype.send;
        const nativeSetHeader = XMLHttpRequest.prototype.setRequestHeader;

        XMLHttpRequest.prototype.open = function (method, url) {
            this.__qwenTestUrl = url || '';
            this.__qwenTestHeaders = {};
            return nativeOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
            if (this.__qwenTestHeaders && name) this.__qwenTestHeaders[String(name)] = String(value);
            return nativeSetHeader.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function (body) {
            try {
                if (this.__qwenTestUrl && (isPageListUrl(this.__qwenTestUrl) || isMsgListUrl(this.__qwenTestUrl))) {
                    captureTemplate(this.__qwenTestUrl, this.__qwenTestHeaders, body);
                }
            } catch (e) {
                // ignore
            }
            return nativeSend.apply(this, arguments);
        };
    }

    function findAny(obj, keys) {
        if (!obj || typeof obj !== 'object') return '';
        for (const key of keys) {
            const parts = String(key).split('.');
            let cur = obj;
            let ok = true;
            for (const p of parts) {
                if (cur && Object.prototype.hasOwnProperty.call(cur, p)) cur = cur[p];
                else {
                    ok = false;
                    break;
                }
            }
            if (ok && cur != null && cur !== '') return cur;
        }
        return '';
    }

    function normalizeTimestamp(raw) {
        if (raw == null || raw === '') return { value: 0, text: '-' };
        const str = String(raw).trim();
        if (!str) return { value: 0, text: '-' };
        if (/^\d+$/.test(str)) {
            const num = Number(str);
            const ms = str.length <= 10 ? num * 1000 : num;
            const dt = new Date(ms);
            return { value: ms, text: Number.isFinite(dt.getTime()) ? dt.toLocaleString() : str };
        }
        const parsed = Date.parse(str);
        if (Number.isFinite(parsed)) return { value: parsed, text: new Date(parsed).toLocaleString() };
        return { value: 0, text: str };
    }

    function extractConversationsFromResponse(respJson) {
        const buckets = [
            respJson?.data?.list,
            respJson?.data?.session_list,
            respJson?.data?.sessions,
            respJson?.data?.page_list,
            respJson?.list,
            respJson?.sessions
        ];
        const rawList = buckets.find((item) => Array.isArray(item)) || [];
        const out = [];
        const seen = new Set();

        rawList.forEach((item, idx) => {
            const id = String(findAny(item, [
                'session_id', 'sessionId', 'id', 'uuid', 'conversation_id', 'conversationId'
            ]) || '').trim();
            if (!id || seen.has(id)) return;
            seen.add(id);

            const title = String(findAny(item, [
                'title', 'name', 'session_name', 'session_title', 'topic', 'summary', 'display_title'
            ]) || `会话 ${idx + 1}`).trim();
            const modified = normalizeTimestamp(findAny(item, [
                'modifiedTime', 'modified_time', 'updated_at', 'update_time', 'gmt_modified'
            ]));
            const created = normalizeTimestamp(findAny(item, [
                'createdTime', 'created_time', 'created_at', 'create_time', 'gmt_create'
            ]));
            const messageCountRaw = findAny(item, ['message_count', 'msg_count', 'badge_count', 'messageCount']);
            const messageCount = Number(messageCountRaw);

            out.push({
                id,
                title: title || `会话 ${id}`,
                modifiedAt: modified.value,
                modifiedAtText: modified.text,
                createdAt: created.value,
                createdAtText: created.text,
                messageCount: Number.isFinite(messageCount) ? messageCount : null,
                raw: item
            });
        });

        return out.sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0));
    }

    function getNextTokenFromResponse(respJson) {
        const candidates = [
            respJson?.data?.next_token,
            respJson?.data?.nextToken,
            respJson?.data?.page_info?.next_token,
            respJson?.data?.pageInfo?.nextToken,
            respJson?.next_token,
            respJson?.nextToken
        ];
        const token = candidates.find((item) => item != null && item !== '');
        return token ? String(token) : '';
    }

    async function fetchConversationPage(nextToken, limit) {
        const url = ensureApiUrl(capturedPageListTemplate?.url, PAGE_LIST_PATH);
        const headers = buildBaseHeaders(capturedPageListTemplate?.headers, true);
        const body = {
            limit,
            next_token: nextToken || '',
            sort_field: 'modifiedTime',
            need_filter_tag: true
        };

        log('page:list', { url, body, headerKeys: Object.keys(headers) });
        const resp = await fetch(url, {
            method: 'POST',
            credentials: 'include',
            headers,
            body: JSON.stringify(body)
        });
        const rawText = await resp.text();
        const json = safeParseJson(rawText);
        if (!resp.ok) throw new Error(`会话列表请求失败: HTTP ${resp.status} ${rawText.slice(0, 300)}`);
        if (!json) throw new Error('会话列表返回非 JSON');
        captureTemplate(url, headers, JSON.stringify(body));
        return json;
    }

    async function fetchRecentConversations(limit, maxPages) {
        const merged = [];
        const seen = new Set();
        let nextToken = '';
        let page = 0;

        while (page < maxPages) {
            page += 1;
            const json = await fetchConversationPage(nextToken, limit);
            const pageItems = extractConversationsFromResponse(json);
            pageItems.forEach((item) => {
                if (seen.has(item.id)) return;
                seen.add(item.id);
                merged.push(item);
            });
            nextToken = getNextTokenFromResponse(json);
            log('page:list:parsed', { page, count: pageItems.length, total: merged.length, nextToken });
            if (!nextToken || !pageItems.length) break;
        }

        return merged.sort((a, b) => (b.modifiedAt || 0) - (a.modifiedAt || 0));
    }

    function normalizeMessageText(text) {
        const t = String(text || '').trim();
        if (!t) return '';
        return t.replace(/^\[\([^)]+\)\]\s*/g, '').trim();
    }

    function collectTextCandidates(value, out, depth) {
        if (value == null || depth > 4) return;
        if (typeof value === 'string' || typeof value === 'number') {
            const text = normalizeMessageText(String(value));
            if (text) out.push(text);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach((item) => collectTextCandidates(item, out, depth + 1));
            return;
        }
        if (typeof value !== 'object') return;
        ['content', 'text', 'value', 'display_text', 'prompt', 'question', 'query', 'input', 'message', 'msg'].forEach((key) => {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                collectTextCandidates(value[key], out, depth + 1);
            }
        });
        if (Array.isArray(value.parts)) collectTextCandidates(value.parts, out, depth + 1);
        if (Array.isArray(value.segments)) collectTextCandidates(value.segments, out, depth + 1);
        if (Array.isArray(value.blocks)) collectTextCandidates(value.blocks, out, depth + 1);
        if (Array.isArray(value.messages)) collectTextCandidates(value.messages, out, depth + 1);
    }

    function isLikelyUserRole(rawRole) {
        const role = String(rawRole || '').toLowerCase();
        return role.includes('user') || role.includes('human') || role.includes('question') || role === 'u';
    }

    function shouldIgnoreMimeType(mimeType) {
        const mt = String(mimeType || '').toLowerCase();
        return mt === 'signal/post'
            || mt === 'bar/progress'
            || mt === 'bar/iframe'
            || mt === 'image/url'
            || mt === 'image_inline'
            || mt === 'ref_source_inline';
    }

    function extractUserTexts(item) {
        const req = Array.isArray(item?.request_messages) ? item.request_messages : [];
        const out = [];
        req.forEach((message) => {
            if (String(message?.mime_type || '').toLowerCase() === 'image/url') return;
            const bucket = [];
            collectTextCandidates(message, bucket, 0);
            bucket.forEach((text) => {
                const clean = normalizeMessageText(text);
                if (clean) out.push(clean);
            });
        });
        const fallbackBucket = [];
        collectTextCandidates({
            query: item?.query,
            question: item?.question,
            prompt: item?.prompt,
            input: item?.input,
            user_message: item?.user_message,
            request: item?.request
        }, fallbackBucket, 0);
        fallbackBucket.forEach((text) => {
            const clean = normalizeMessageText(text);
            if (clean) out.push(clean);
        });
        const mixedMessages = Array.isArray(item?.messages) ? item.messages : [];
        mixedMessages.forEach((message) => {
            if (!isLikelyUserRole(message?.role || message?.sender_role || message?.author_role || message?.type)) return;
            const bucket = [];
            collectTextCandidates(message, bucket, 0);
            bucket.forEach((text) => {
                const clean = normalizeMessageText(text);
                if (clean) out.push(clean);
            });
        });
        return Array.from(new Set(out));
    }

    function extractAssistantTexts(item) {
        const resp = Array.isArray(item?.response_messages) ? item.response_messages : [];
        const out = [];
        resp.forEach((message) => {
            if (shouldIgnoreMimeType(message?.mime_type)) return;
            const content = normalizeMessageText(message?.content || '');
            if (content) out.push(content);
        });
        return Array.from(new Set(out));
    }

    function getMessageSortValue(item, fallbackIdx) {
        const candidates = [
            item?.request_timestamp,
            item?.created_at,
            item?.updated_at,
            item?.create_time,
            item?.update_time,
            item?.pos,
            item?.position
        ];
        for (const raw of candidates) {
            const str = String(raw == null ? '' : raw).trim();
            if (/^\d+$/.test(str)) return Number(str);
            const ts = Date.parse(str);
            if (Number.isFinite(ts)) return ts;
        }
        return fallbackIdx;
    }

    function parseMessagesFromResponse(respJson) {
        const arr = Array.isArray(respJson?.data?.list) ? respJson.data.list : [];
        const out = [];
        arr.forEach((item, idx) => {
            const baseOrder = getMessageSortValue(item, idx + 1) * 10;
            const reqId = String(item?.req_id || item?.request_id || `qwen-req-${idx + 1}`);
            extractUserTexts(item).forEach((text, i) => {
                out.push({ id: `${reqId}-u-${i + 1}`, role: 'user', text, order: baseOrder + i * 2 + 1 });
            });
            extractAssistantTexts(item).forEach((text, i) => {
                out.push({ id: `${reqId}-a-${i + 1}`, role: 'assistant', text, order: baseOrder + i * 2 + 2 });
            });
        });
        return out.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    function getNextPagePos(respJson) {
        const arr = Array.isArray(respJson?.data?.list) ? respJson.data.list : [];
        const candidates = arr.map((item) => {
            const raw = item?.pos ?? item?.position ?? item?.request_timestamp ?? item?.created_at ?? item?.updated_at;
            const str = String(raw == null ? '' : raw).trim();
            return /^\d+$/.test(str) ? str : '';
        }).filter(Boolean);
        if (!candidates.length) return '';
        return candidates.reduce((min, cur) => (BigInt(cur) < BigInt(min) ? cur : min), candidates[0]);
    }

    async function fetchConversationMessages(sessionId) {
        const headers = buildBaseHeaders(capturedMsgListTemplate?.headers, false);
        const baseUrl = ensureApiUrl(capturedMsgListTemplate?.url, MSG_LIST_PATH, { session_id: sessionId });
        const allMessages = [];
        const seenIds = new Set();
        let currentUrl = baseUrl;
        let lastPos = '';
        let page = 0;

        while (currentUrl && page < 20) {
            page += 1;
            const resp = await fetch(currentUrl, {
                method: 'GET',
                credentials: 'include',
                headers
            });
            const rawText = await resp.text();
            const json = safeParseJson(rawText);
            if (!resp.ok) throw new Error(`消息请求失败: HTTP ${resp.status} ${rawText.slice(0, 300)}`);
            if (!json) throw new Error('消息接口返回非 JSON');

            captureTemplate(currentUrl, headers, '');
            const parsed = parseMessagesFromResponse(json);
            parsed.forEach((item) => {
                const id = String(item?.id || '').trim();
                if (!id || seenIds.has(id)) return;
                seenIds.add(id);
                allMessages.push(item);
            });

            const hasNext = Boolean(json?.data?.have_next_page);
            const nextPos = getNextPagePos(json);
            log('msg:list:page', { sessionId, page, parsed: parsed.length, total: allMessages.length, hasNext, nextPos });
            if (!hasNext || !nextPos || nextPos === lastPos) break;
            lastPos = nextPos;
            currentUrl = ensureApiUrl(capturedMsgListTemplate?.url, MSG_LIST_PATH, {
                session_id: sessionId,
                pos: nextPos,
                page_size: 50,
                return_response_messages: 'true',
                event_filter: 'all'
            });
        }

        return allMessages.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    function downloadText(filename, content, mimeType) {
        const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function toMarkdown(conversations) {
        return conversations.map((conv, convIdx) => {
            const header = `# ${convIdx + 1}. ${conv.title}\n\n- 会话ID: ${conv.conversationId}\n- 更新时间: ${conv.modifiedAtText}\n- 创建时间: ${conv.createdAtText}\n- 消息数: ${conv.messages.length}\n`;
            const body = conv.messages.map((msg, idx) => `\n## ${idx + 1}. ${msg.role === 'user' ? '用户' : '千问'}\n\n${msg.text || ''}\n`).join('\n');
            return `${header}${body}`;
        }).join('\n\n---\n\n');
    }

    function toText(conversations) {
        return conversations.map((conv, convIdx) => {
            const header = `${convIdx + 1}. ${conv.title}\n会话ID: ${conv.conversationId}\n更新时间: ${conv.modifiedAtText}\n创建时间: ${conv.createdAtText}\n消息数: ${conv.messages.length}`;
            const body = conv.messages.map((msg, idx) => `\n[${idx + 1}] ${msg.role === 'user' ? '用户' : '千问'}\n${msg.text || ''}`).join('\n');
            return `${header}\n${body}`;
        }).join('\n\n==================================================\n\n');
    }

    function escapeHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function createUI() {
        GM_addStyle(`
            .qbt-btn{position:fixed;right:24px;bottom:24px;z-index:999999;background:#2563eb;color:#fff;border:none;border-radius:999px;padding:10px 16px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 10px 30px rgba(37,99,235,.28)}
            .qbt-mask{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:999998;display:none;align-items:center;justify-content:center}
            .qbt-modal{width:min(920px,92vw);max-height:86vh;background:#fff;border-radius:16px;box-shadow:0 24px 80px rgba(15,23,42,.24);display:flex;flex-direction:column;overflow:hidden}
            .qbt-head{padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between}
            .qbt-body{padding:16px 20px;overflow:auto;background:#f8fafc}
            .qbt-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
            .qbt-list{margin-top:14px;border:1px solid #e2e8f0;border-radius:12px;background:#fff;overflow:auto;max-height:520px}
            .qbt-item{display:flex;gap:12px;align-items:flex-start;padding:14px 16px;border-bottom:1px solid #eef2f7}
            .qbt-item:last-child{border-bottom:none}
            .qbt-title{font-size:14px;font-weight:700;color:#0f172a;margin:0}
            .qbt-meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
            .qbt-tag{font-size:11px;color:#475569;background:#f1f5f9;border-radius:999px;padding:4px 8px}
            .qbt-status{font-size:12px;color:#475569;margin-top:10px;white-space:pre-wrap}
            .qbt-input{width:88px;border:1px solid #cbd5e1;border-radius:8px;padding:6px 8px;font-size:12px;background:#fff}
            .qbt-btn2{border:1px solid #cbd5e1;background:#fff;color:#1e293b;border-radius:10px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer}
            .qbt-btn2.primary{background:#2563eb;border-color:#2563eb;color:#fff}
            .qbt-btn2.success{background:#0f766e;border-color:#0f766e;color:#fff}
            .qbt-close{border:none;background:transparent;font-size:20px;line-height:1;cursor:pointer;color:#64748b}
        `);

        const btn = document.createElement('button');
        btn.className = 'qbt-btn';
        btn.textContent = '千问批量测试';

        const mask = document.createElement('div');
        mask.className = 'qbt-mask';
        mask.innerHTML = `
            <div class="qbt-modal">
                <div class="qbt-head">
                    <div>
                        <div style="font-size:16px;font-weight:800;color:#0f172a;">千问批量导出测试</div>
                        <div style="font-size:12px;color:#64748b;margin-top:4px;">测试 /api/v2/session/page/list 拉取历史会话，并导出选中会话</div>
                    </div>
                    <button class="qbt-close" type="button">×</button>
                </div>
                <div class="qbt-body">
                    <div class="qbt-row">
                        <label>每页数量 <input id="qbt-limit" class="qbt-input" type="text" value="50"></label>
                        <label>最多页数 <input id="qbt-pages" class="qbt-input" type="text" value="5"></label>
                        <button id="qbt-load" class="qbt-btn2 primary" type="button">加载会话</button>
                        <button id="qbt-select-all" class="qbt-btn2" type="button">全选</button>
                        <button id="qbt-export-json" class="qbt-btn2 success" type="button">导出 JSON</button>
                        <button id="qbt-export-md" class="qbt-btn2" type="button">导出 Markdown</button>
                        <button id="qbt-export-txt" class="qbt-btn2" type="button">导出 TXT</button>
                    </div>
                    <div id="qbt-status" class="qbt-status">等待加载历史会话...</div>
                    <div id="qbt-list" class="qbt-list"></div>
                </div>
            </div>
        `;

        document.body.appendChild(btn);
        document.body.appendChild(mask);

        const close = () => { mask.style.display = 'none'; };
        const open = () => { mask.style.display = 'flex'; };
        btn.addEventListener('click', open);
        mask.querySelector('.qbt-close').addEventListener('click', close);
        mask.addEventListener('click', (e) => {
            if (e.target === mask) close();
        });

        const listEl = mask.querySelector('#qbt-list');
        const statusEl = mask.querySelector('#qbt-status');
        const limitInput = mask.querySelector('#qbt-limit');
        const pagesInput = mask.querySelector('#qbt-pages');
        const selectAllBtn = mask.querySelector('#qbt-select-all');
        let conversations = [];

        function renderList() {
            if (!conversations.length) {
                listEl.innerHTML = '<div style="padding:18px;color:#64748b;font-size:12px;">暂无会话数据</div>';
                return;
            }
            listEl.innerHTML = conversations.map((item, idx) => `
                <label class="qbt-item">
                    <input type="checkbox" class="qbt-ck" data-id="${escapeHtml(item.id)}" checked>
                    <div style="flex:1;min-width:0">
                        <p class="qbt-title">${escapeHtml(item.title)}</p>
                        <div class="qbt-meta">
                            <span class="qbt-tag">#${idx + 1}</span>
                            <span class="qbt-tag">会话ID: ${escapeHtml(item.id)}</span>
                            <span class="qbt-tag">更新时间: ${escapeHtml(item.modifiedAtText)}</span>
                            <span class="qbt-tag">创建时间: ${escapeHtml(item.createdAtText)}</span>
                            <span class="qbt-tag">消息数: ${escapeHtml(item.messageCount == null ? '-' : item.messageCount)}</span>
                        </div>
                    </div>
                </label>
            `).join('');
        }

        function getSelected() {
            const map = new Map(conversations.map((item) => [item.id, item]));
            return Array.from(listEl.querySelectorAll('.qbt-ck:checked'))
                .map((ck) => map.get(String(ck.getAttribute('data-id') || '')))
                .filter(Boolean);
        }

        async function exportSelected(format) {
            const selected = getSelected();
            if (!selected.length) {
                alert('请先勾选至少一个会话');
                return;
            }
            statusEl.textContent = `开始导出 ${selected.length} 个会话...`;
            const out = [];
            let failCount = 0;

            for (let i = 0; i < selected.length; i++) {
                const conv = selected[i];
                statusEl.textContent = `导出中 ${i + 1}/${selected.length}: ${conv.title}`;
                try {
                    const messages = await fetchConversationMessages(conv.id);
                    out.push({
                        conversationId: conv.id,
                        title: conv.title,
                        modifiedAtText: conv.modifiedAtText,
                        createdAtText: conv.createdAtText,
                        messages: messages.map((msg) => ({ role: msg.role, text: msg.text }))
                    });
                } catch (e) {
                    failCount += 1;
                    log('export:error', conv.id, e);
                }
            }

            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            if (format === 'json') {
                downloadText(`千问_批量导出_${stamp}.json`, JSON.stringify({
                    exportedAt: new Date().toISOString(),
                    conversationCount: out.length,
                    conversations: out
                }, null, 2), 'application/json');
            } else if (format === 'md') {
                downloadText(`千问_批量导出_${stamp}.md`, toMarkdown(out), 'text/markdown');
            } else {
                downloadText(`千问_批量导出_${stamp}.txt`, toText(out), 'text/plain');
            }

            statusEl.textContent = `导出完成：成功 ${out.length} 个会话${failCount ? `，失败 ${failCount} 个` : ''}`;
        }

        mask.querySelector('#qbt-load').addEventListener('click', async () => {
            const limit = Math.max(1, Number(limitInput.value) || 50);
            const maxPages = Math.max(1, Number(pagesInput.value) || 5);
            statusEl.textContent = '正在加载历史会话...';
            listEl.innerHTML = '<div style="padding:18px;color:#475569;font-size:12px;">加载中...</div>';
            try {
                conversations = await fetchRecentConversations(limit, maxPages);
                statusEl.textContent = `加载完成：共 ${conversations.length} 个会话`;
                renderList();
            } catch (e) {
                statusEl.textContent = `加载失败：${e.message || String(e)}`;
                listEl.innerHTML = '<div style="padding:18px;color:#b91c1c;font-size:12px;">加载失败，请看控制台日志</div>';
            }
        });

        selectAllBtn.addEventListener('click', () => {
            const items = Array.from(listEl.querySelectorAll('.qbt-ck'));
            if (!items.length) return;
            const shouldCheck = items.some((item) => !item.checked);
            items.forEach((item) => { item.checked = shouldCheck; });
        });

        mask.querySelector('#qbt-export-json').addEventListener('click', () => exportSelected('json'));
        mask.querySelector('#qbt-export-md').addEventListener('click', () => exportSelected('md'));
        mask.querySelector('#qbt-export-txt').addEventListener('click', () => exportSelected('txt'));
    }

    installHooks();

    function boot() {
        if (!document.body || document.querySelector('.qbt-btn')) return;
        createUI();
    }

    if (document.body) boot();
    else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
