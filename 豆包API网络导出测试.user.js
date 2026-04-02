// ==UserScript==
// @name         豆包API网络导出测试
// @namespace    http://tampermonkey.net/
// @version      0.2.3
// @description  在豆包页面测试 /im/chain/single 与 /im/chain/recent_conv，支持批量对话导出
// @author       xchengb
// @match        *://www.doubao.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const DEFAULT_QUERY_BASE = 'version_code=20800&language=zh&device_platform=web&aid=497858&real_aid=497858&pkg_type=release_version&device_id=7571732726702835209&pc_version=3.12.3&web_id=7572300776296236571&tea_uuid=7572300776296236571&region=CN&sys_region=CN&samantha_web=1&use-olympus-account=1';

    let capturedTemplate = null;
    let capturedRecentConvUrl = '';

    function log(...args) {
        console.log('[Doubao-API-Test]', ...args);
    }

    function getConvIdFromUrl() {
        const m = location.pathname.match(/\/chat\/(\d+)/);
        return m ? m[1] : '';
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
        sessionStorage.setItem('db_api_test_web_tab_id', tabId);
        return tabId;
    }

    function getWebTabIdFromUrl(rawUrl) {
        try {
            const u = new URL(rawUrl, location.origin);
            return String(u.searchParams.get('web_tab_id') || '').trim();
        } catch (e) {
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
        push(getWebTabIdFromUrl(location.href));
        push(getWebTabIdFromUrl(capturedRecentConvUrl));
        push(getWebTabIdFromUrl(capturedTemplate?.url || ''));
        push(sessionStorage.getItem('db_api_test_web_tab_id') || '');

        try {
            const entries = performance.getEntriesByType('resource') || [];
            for (let i = entries.length - 1; i >= 0; i--) {
                const name = entries[i]?.name || '';
                if (!/\/im\/chain\/(single|recent_conv)\?/i.test(name)) continue;
                push(getWebTabIdFromUrl(name));
                if (out.length >= 5) break;
            }
        } catch (e) {
            // ignore
        }

        if (!out.length) push(createUuid());
        return out;
    }

    function getOrCreateWebTabId() {
        try {
            if (capturedTemplate?.url) {
                const u = new URL(capturedTemplate.url, location.origin);
                const tabId = u.searchParams.get('web_tab_id');
                if (tabId) {
                    return rememberWebTabId(tabId);
                }
            }
        } catch (e) {
            // ignore parsing error
        }

        try {
            if (capturedRecentConvUrl) {
                const tabId = getWebTabIdFromUrl(capturedRecentConvUrl);
                if (tabId) return rememberWebTabId(tabId);
            }
        } catch (e) {
            // ignore
        }

        let id = sessionStorage.getItem('db_api_test_web_tab_id');
        if (!id) {
            id = createUuid();
        }
        return rememberWebTabId(id);
    }

    function ensureChainSingleQuery(rawUrl) {
        const u = new URL(rawUrl, location.origin);
        const defaults = new URLSearchParams(DEFAULT_QUERY_BASE);

        defaults.forEach((v, k) => {
            if (!u.searchParams.has(k)) u.searchParams.set(k, v);
        });

        if (!u.searchParams.get('web_tab_id')) {
            u.searchParams.set('web_tab_id', getOrCreateWebTabId());
        }

        return u.toString();
    }

    function ensureRecentConvQuery(rawUrl, preferredWebTabId = '', keepOriginalQuery = false) {
        const u = new URL(rawUrl, location.origin);
        if (!keepOriginalQuery) {
            const defaults = new URLSearchParams(DEFAULT_QUERY_BASE);
            defaults.forEach((v, k) => {
                if (!u.searchParams.has(k)) u.searchParams.set(k, v);
            });
        }

        const tabId = String(preferredWebTabId || u.searchParams.get('web_tab_id') || getOrCreateWebTabId()).trim();
        if (tabId) u.searchParams.set('web_tab_id', rememberWebTabId(tabId));

        return u.toString();
    }

    function isChainSingleUrl(rawUrl) {
        try {
            const u = new URL(rawUrl, location.origin);
            return u.origin === location.origin && u.pathname === '/im/chain/single';
        } catch (e) {
            return false;
        }
    }

    function isRecentConvUrl(rawUrl) {
        try {
            const u = new URL(rawUrl, location.origin);
            return u.origin === location.origin && u.pathname === '/im/chain/recent_conv';
        } catch (e) {
            return false;
        }
    }

    function safeParseJson(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    function sanitizeHeaders(inputHeaders) {
        const blocked = new Set([
            'cookie', 'host', 'origin', 'referer', 'content-length',
            'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest',
            'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
            'accept-encoding', 'connection'
        ]);

        const out = {};
        Object.entries(inputHeaders || {}).forEach(([k, v]) => {
            const key = String(k).toLowerCase();
            if (!blocked.has(key)) out[key] = String(v);
        });

        if (!out['accept']) out['accept'] = 'application/json, text/plain, */*';
        if (!out['content-type']) out['content-type'] = 'application/json; encoding=utf-8';
        if (!out['agw-js-conv']) out['agw-js-conv'] = 'str';
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

    function deepReplaceConvId(value, convId, parentKey = '') {
        if (value == null) return value;
        if (typeof value === 'string') return value;
        if (Array.isArray(value)) return value.map(v => deepReplaceConvId(v, convId, parentKey));
        if (typeof value === 'object') {
            const out = {};
            Object.entries(value).forEach(([k, v]) => {
                const key = k.toLowerCase();
                const shouldReplaceConvId = (
                    key === 'conversation_id' ||
                    key === 'conv_id' ||
                    key === 'chat_id' ||
                    key === 'section_id'
                );

                if (shouldReplaceConvId) {
                    out[k] = convId;
                } else {
                    out[k] = deepReplaceConvId(v, convId, key);
                }
            });
            return out;
        }
        return value;
    }

    function buildDefaultRequest(convId) {
        return {
            url: ensureChainSingleQuery(`${location.origin}/im/chain/single`),
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
                        filter: {
                            index_list: []
                        }
                    }
                },
                sequence_id: createUuid(),
                channel: 2,
                version: '1'
            }
        };
    }

    function buildRequest(convId, customBodyText) {
        const fallback = buildDefaultRequest(convId);

        let bodyObj = null;
        if (customBodyText && customBodyText.trim()) {
            bodyObj = safeParseJson(customBodyText.trim());
            if (!bodyObj) throw new Error('请求体不是合法 JSON');
        } else if (capturedTemplate && capturedTemplate.body) {
            const parsed = safeParseJson(capturedTemplate.body);
            bodyObj = parsed ? deepReplaceConvId(parsed, convId) : null;
        }

        if (!bodyObj) bodyObj = fallback.body;

        const baseUrl = ensureChainSingleQuery(capturedTemplate?.url || fallback.url);

        const headers = sanitizeHeaders({
            ...(capturedTemplate?.headers || {}),
            ...fallback.headers
        });

        return {
            url: baseUrl,
            headers,
            body: bodyObj
        };
    }

    function formatTime(ts) {
        const n = Number(ts || 0);
        if (!Number.isFinite(n) || n <= 0) return '';
        const ms = n > 1e12 ? n : n * 1000;
        const d = new Date(ms);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString();
    }

    function getStringByPath(obj, path) {
        const parts = String(path || '').split('.').filter(Boolean);
        let cur = obj;
        for (const p of parts) {
            if (!cur || typeof cur !== 'object') return '';
            cur = cur[p];
        }
        return typeof cur === 'string' ? cur.trim() : '';
    }

    function findNestedConversationTitle(obj, maxDepth = 4) {
        if (!obj || typeof obj !== 'object' || maxDepth < 0) return '';

        const directKeys = [
            'name',
            'title',
            'conversation_title',
            'conv_title',
            'chat_title',
            'display_title'
        ];

        for (const key of directKeys) {
            const val = typeof obj[key] === 'string' ? obj[key].trim() : '';
            if (val && !/^[0-9]{8,}$/.test(val)) return val;
        }

        if (maxDepth === 0) return '';

        for (const v of Object.values(obj)) {
            if (!v || typeof v !== 'object') continue;
            const nested = findNestedConversationTitle(v, maxDepth - 1);
            if (nested) return nested;
        }

        return '';
    }

    function resolveConversationTitle(item, id) {
        const preferredPaths = [
            'name',
            'title',
            'conversation_title',
            'conv_title',
            'chat_title',
            'conversation.name',
            'conversation.title',
            'conversation_info.name',
            'conversation_info.title',
            'conv.name',
            'conv.title',
            'coco_conversation.name',
            'coco_conversation.title',
            'chain_info.name',
            'chain_info.title',
            'meta.name',
            'meta.title'
        ];

        for (const p of preferredPaths) {
            const val = getStringByPath(item, p);
            if (val && !/^[0-9]{8,}$/.test(val)) return val;
        }

        const nested = findNestedConversationTitle(item, 5);
        if (nested) return nested;

        return `会话 ${id}`;
    }

    function getNumberByPath(obj, path) {
        const parts = String(path || '').split('.').filter(Boolean);
        let cur = obj;
        for (const p of parts) {
            if (!cur || typeof cur !== 'object') return null;
            cur = cur[p];
        }
        const n = Number(cur);
        return Number.isFinite(n) ? n : null;
    }

    function findNestedBadgeCount(obj, maxDepth = 5) {
        if (!obj || typeof obj !== 'object' || maxDepth < 0) return null;

        const direct = Number(obj.badge_count);
        if (Number.isFinite(direct)) return direct;

        if (maxDepth === 0) return null;
        for (const v of Object.values(obj)) {
            if (!v || typeof v !== 'object') continue;
            const found = findNestedBadgeCount(v, maxDepth - 1);
            if (Number.isFinite(found)) return found;
        }
        return null;
    }

    function resolveConversationBadgeCount(item) {
        const preferredPaths = [
            'badge_count',
            'conversation.badge_count',
            'conversation_info.badge_count',
            'conv.badge_count',
            'coco_conversation.badge_count',
            'chain_info.badge_count'
        ];

        for (const p of preferredPaths) {
            const n = getNumberByPath(item, p);
            if (Number.isFinite(n)) return n;
        }

        return findNestedBadgeCount(item, 5);
    }

    function findNestedTimestamp(obj, keys, maxDepth = 5) {
        if (!obj || typeof obj !== 'object' || maxDepth < 0) return null;

        for (const key of keys) {
            const n = Number(obj[key]);
            if (Number.isFinite(n) && n > 0) return n;
        }

        if (maxDepth === 0) return null;
        for (const v of Object.values(obj)) {
            if (!v || typeof v !== 'object') continue;
            const found = findNestedTimestamp(v, keys, maxDepth - 1);
            if (Number.isFinite(found) && found > 0) return found;
        }
        return null;
    }

    function resolveConversationTimestamps(item) {
        const createPaths = [
            'create_time',
            'created_at',
            'create_timestamp',
            'conversation.create_time',
            'conversation.created_at',
            'conversation_info.create_time',
            'conversation_info.created_at',
            'conv.create_time',
            'conv.created_at',
            'coco_conversation.create_time',
            'coco_conversation.created_at',
            'chain_info.create_time',
            'chain_info.created_at'
        ];

        const updatePaths = [
            'update_time',
            'updated_at',
            'update_timestamp',
            'conversation.update_time',
            'conversation.updated_at',
            'conversation_info.update_time',
            'conversation_info.updated_at',
            'conv.update_time',
            'conv.updated_at',
            'coco_conversation.update_time',
            'coco_conversation.updated_at',
            'chain_info.update_time',
            'chain_info.updated_at'
        ];

        let createdAt = null;
        for (const p of createPaths) {
            const n = getNumberByPath(item, p);
            if (Number.isFinite(n) && n > 0) {
                createdAt = n;
                break;
            }
        }
        if (!Number.isFinite(createdAt) || createdAt <= 0) {
            createdAt = findNestedTimestamp(item, ['create_time', 'created_at', 'create_timestamp'], 6);
        }

        let updatedAt = null;
        for (const p of updatePaths) {
            const n = getNumberByPath(item, p);
            if (Number.isFinite(n) && n > 0) {
                updatedAt = n;
                break;
            }
        }
        if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
            updatedAt = findNestedTimestamp(item, ['update_time', 'updated_at', 'update_timestamp'], 6);
        }

        return {
            createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : 0,
            updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0
        };
    }

    function extractRecentConversations(respJson) {
        const direct = respJson?.downlink_body?.pull_recent_conv_chain_downlink_body
            || respJson?.downlink_body?.pull_recent_conv_downlink_body;
        const arr = [
            ...(Array.isArray(direct?.conversation_list) ? direct.conversation_list : []),
            ...(Array.isArray(direct?.conversations) ? direct.conversations : []),
            ...(Array.isArray(respJson?.data?.conversation_list) ? respJson.data.conversation_list : []),
            ...(Array.isArray(respJson?.data?.conversations) ? respJson.data.conversations : [])
        ];

        const out = [];
        const seen = new Set();

        const pushConv = (item) => {
            if (!item || typeof item !== 'object') return;
            const id = String(
                item.conversation_id
                || item.conv_id
                || item.id
                || item.chat_id
                || ''
            ).trim();
            if (!id || seen.has(id)) return;

            const title = resolveConversationTitle(item, id);
            const badgeCount = resolveConversationBadgeCount(item);
            const ts = resolveConversationTimestamps(item);
            const createdAt = ts.createdAt || 0;
            const updatedAt = ts.updatedAt || createdAt || 0;

            seen.add(id);
            out.push({
                id,
                title: title || `会话 ${id}`,
                badgeCount: Number.isFinite(badgeCount) ? badgeCount : null,
                createdAt,
                createdAtText: formatTime(createdAt),
                updatedAt,
                updatedAtText: formatTime(updatedAt),
                raw: item
            });
        };

        arr.forEach(pushConv);

        if (!out.length) {
            const queue = [respJson];
            while (queue.length) {
                const cur = queue.shift();
                if (!cur || typeof cur !== 'object') continue;
                if (Array.isArray(cur)) {
                    cur.forEach((x) => queue.push(x));
                    continue;
                }
                pushConv(cur);
                Object.values(cur).forEach((v) => {
                    if (v && typeof v === 'object') queue.push(v);
                });
            }
        }

        out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        return out;
    }

    async function fetchRecentConversations(customUrl = '') {
        const baseUrl = customUrl || capturedRecentConvUrl || `${location.origin}/im/chain/recent_conv`;
        const keepOriginalQuery = Boolean(customUrl && customUrl.trim());
        const headers = sanitizeHeaders(capturedTemplate?.headers || {});
        headers.accept = 'application/json, text/plain, */*';

        const errors = [];
        const candidates = getWebTabIdCandidates(baseUrl);

        // 优先按真实抓包体 POST，请求体结构来自页面实际 recent_conv 调用。
        for (const tabId of candidates) {
            const url = ensureRecentConvQuery(baseUrl, tabId, keepOriginalQuery);
            const postBody = {
                cmd: 3200,
                uplink_body: {
                    pull_recent_conv_chain_uplink_body: {
                        limit: 20,
                        message_count_per_conv: 10,
                        api_version: 1,
                        conv_version: 0,
                        direction: 3,
                        option: {
                            not_need_message: true,
                            need_complete_conversation: true,
                            need_coco_conversation: true,
                            need_coco_bot: true,
                            need_pc_pin_chain: true,
                            pc_pin_query_type: 0
                        }
                    }
                },
                sequence_id: createUuid(),
                channel: 2,
                version: '1'
            };

            const postHeaders = {
                ...headers,
                'content-type': 'application/json; encoding=utf-8',
                'agw-js-conv': 'str'
            };

            const resp = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: postHeaders,
                body: JSON.stringify(postBody)
            });

            const text = await resp.text();
            const json = safeParseJson(text);
            if (!resp.ok) {
                errors.push(`POST(main) ${tabId}: HTTP ${resp.status}`);
                continue;
            }
            if (!json) {
                errors.push(`POST(main) ${tabId}: non-json`);
                continue;
            }
            if (Number(json.status_code || 0) === 0) {
                rememberWebTabId(tabId);
                return { url, rawText: text, json, conversations: extractRecentConversations(json) };
            }
            errors.push(`POST(main) ${tabId}: code=${json.status_code}, msg=${json.status_desc || 'unknown'}`);
        }

        for (const tabId of candidates) {
            const url = ensureRecentConvQuery(baseUrl, tabId, keepOriginalQuery);
            const resp = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers
            });

            const text = await resp.text();
            const json = safeParseJson(text);
            if (!resp.ok) {
                errors.push(`GET ${tabId}: HTTP ${resp.status}`);
                continue;
            }
            if (!json) {
                errors.push(`GET ${tabId}: non-json`);
                continue;
            }
            if (Number(json.status_code || 0) === 0) {
                rememberWebTabId(tabId);
                return { url, rawText: text, json, conversations: extractRecentConversations(json) };
            }
            errors.push(`GET ${tabId}: code=${json.status_code}, msg=${json.status_desc || 'unknown'}`);
        }

        // 旧 POST 体兜底（兼容历史结构）。
        for (const tabId of candidates) {
            const url = ensureRecentConvQuery(baseUrl, tabId, keepOriginalQuery);
            const postBody = {
                cmd: 3200,
                uplink_body: {
                    pull_recent_conv_uplink_body: {
                        limit: 100,
                        offset: 0,
                        ext: {}
                    }
                },
                sequence_id: createUuid(),
                channel: 2,
                version: '1'
            };

            const postHeaders = {
                ...headers,
                'content-type': 'application/json; encoding=utf-8'
            };

            const resp = await fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: postHeaders,
                body: JSON.stringify(postBody)
            });

            const text = await resp.text();
            const json = safeParseJson(text);
            if (!resp.ok) {
                errors.push(`POST ${tabId}: HTTP ${resp.status}`);
                continue;
            }
            if (!json) {
                errors.push(`POST ${tabId}: non-json`);
                continue;
            }
            if (Number(json.status_code || 0) === 0) {
                rememberWebTabId(tabId);
                return { url, rawText: text, json, conversations: extractRecentConversations(json) };
            }
            errors.push(`POST ${tabId}: code=${json.status_code}, msg=${json.status_desc || 'unknown'}`);
        }

        throw new Error(`recent_conv 请求失败（已重试 ${candidates.length} 个 web_tab_id）。${errors.slice(0, 4).join(' | ')}`);
    }

    async function fetchConversationMessagesByApi(convId, customBodyText = '', customUrl = '', msgCursor = '') {
        const req = buildRequest(convId, customBodyText);
        if (customUrl) req.url = ensureChainSingleQuery(customUrl);

        const pullBody = req?.body?.uplink_body?.pull_singe_chain_uplink_body || {};
        pullBody.conversation_id = convId;
        pullBody.limit = Number(pullBody.limit || 50) || 50;
        if (msgCursor) pullBody.msg_cursor = String(msgCursor);
        else if ('msg_cursor' in pullBody) delete pullBody.msg_cursor;

        const resp = await fetch(req.url, {
            method: 'POST',
            credentials: 'include',
            headers: req.headers,
            body: JSON.stringify(req.body)
        });

        const text = await resp.text();
        const json = safeParseJson(text);
        if (!resp.ok) {
            throw new Error(`chain/single HTTP ${resp.status}: ${text.slice(0, 200)}`);
        }
        if (!json) {
            throw new Error('chain/single 返回非 JSON');
        }
        if (Number(json.status_code || 0) !== 0) {
            throw new Error(`chain/single status_code=${json.status_code}, msg=${json.status_desc || 'unknown'}`);
        }

        const payload = json?.downlink_body?.pull_singe_chain_downlink_body || {};
        return {
            req,
            text,
            json,
            parsed: parseMessagesFromResponse(json),
            hasMore: Boolean(payload.has_more),
            nextCursor: String(payload.msg_cursor || '')
        };
    }

    async function fetchAllConversationMessages(convId, options = {}) {
        const maxPages = Number(options.maxPages || 20);
        const customBodyText = options.customBodyText || '';
        const customUrl = options.customUrl || '';
        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : () => {};

        let cursor = '';
        let page = 0;
        let done = false;
        let lastReq = null;
        let lastRaw = '';
        const all = [];
        const seenIds = new Set();

        while (!done && page < maxPages) {
            page += 1;
            const res = await fetchConversationMessagesByApi(convId, customBodyText, customUrl, cursor);
            lastReq = res.req;
            lastRaw = res.text;

            res.parsed.forEach((m) => {
                const idKey = String(m.id || `${m.index}_${m.role}_${m.text.slice(0, 32)}`);
                if (seenIds.has(idKey)) return;
                seenIds.add(idKey);
                all.push(m);
            });

            onProgress({ page, count: all.length, hasMore: res.hasMore, cursor: res.nextCursor });

            if (!res.hasMore || !res.nextCursor || res.nextCursor === cursor) {
                done = true;
            } else {
                cursor = res.nextCursor;
            }
        }

        all.sort((a, b) => a.index - b.index);
        return { messages: all, pages: page, req: lastReq, rawText: lastRaw };
    }

    function downloadFile(fileName, content, mimeType) {
        const blob = new Blob([content], { type: mimeType || 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    function collectTextFromBlock(block) {
        const lines = [];

        function pushText(t) {
            const text = String(t || '').trim();
            if (text) lines.push(text);
        }

        function walk(node) {
            if (!node) return;
            if (typeof node === 'string') {
                pushText(node);
                return;
            }
            if (Array.isArray(node)) {
                node.forEach(walk);
                return;
            }
            if (typeof node !== 'object') return;

            if (node.text_block && node.text_block.text) pushText(node.text_block.text);
            if (node.reference_block && node.reference_block.text && node.reference_block.text.text) {
                pushText(node.reference_block.text.text);
            }
            if (typeof node.text === 'string') pushText(node.text);
            if (typeof node.content === 'string') pushText(node.content);

            Object.values(node).forEach(walk);
        }

        walk(block);

        return Array.from(new Set(lines)).join('\n').trim();
    }

    function parseMessagesFromResponse(respJson) {
        const payload = respJson?.downlink_body?.pull_singe_chain_downlink_body;
        const messages = Array.isArray(payload?.messages) ? payload.messages : [];

        const parsed = messages.map((m) => {
            const role = Number(m?.user_type) === 1 ? 'user' : 'assistant';
            const blocks = Array.isArray(m?.content_block) ? m.content_block : [];
            const text = blocks.map(collectTextFromBlock).filter(Boolean).join('\n\n').trim() ||
                String(m?.content || '').trim() ||
                String(m?.tts_content || '').trim();

            return {
                id: m?.message_id || '',
                conversationId: m?.conversation_id || '',
                role,
                index: Number(m?.index_in_conv || 0),
                text
            };
        }).filter(m => m.text);

        parsed.sort((a, b) => a.index - b.index);
        return parsed;
    }

    function installCaptureHooks() {
        const nativeFetch = window.fetch;
        window.fetch = async function (...args) {
            const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
            const init = args[1] || {};
            if (url && isChainSingleUrl(url)) {
                capturedTemplate = {
                    url,
                    method: (init.method || 'POST').toUpperCase(),
                    headers: parseHeadersObject(init.headers),
                    body: typeof init.body === 'string' ? init.body : ''
                };
                log('捕获到 fetch 模板', capturedTemplate);
            }
            if (url && isRecentConvUrl(url)) {
                capturedRecentConvUrl = String(url || '');
                const tabId = getWebTabIdFromUrl(url);
                if (tabId) rememberWebTabId(tabId);
            }
            return nativeFetch.apply(this, args);
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
            if (this.__dbHeaders) this.__dbHeaders[name] = value;
            return nativeSetHeader.call(this, name, value);
        };

        XMLHttpRequest.prototype.send = function (body) {
            if (this.__dbUrl && isChainSingleUrl(this.__dbUrl)) {
                capturedTemplate = {
                    url: this.__dbUrl,
                    method: String(this.__dbMethod || 'POST').toUpperCase(),
                    headers: this.__dbHeaders || {},
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
        GM_addStyle(`
            .db-test-btn { position: fixed; right: 22px; bottom: 24px; z-index: 999999; border: none; border-radius: 999px; background: #0f172a; color: #fff; padding: 10px 14px; font-size: 13px; cursor: pointer; box-shadow: 0 10px 30px rgba(0,0,0,0.2); }
            .db-mask { position: fixed; inset: 0; z-index: 999999; background: rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; }
            .db-modal { width: min(980px, 92vw); height: min(82vh, 860px); background: #fff; border-radius: 16px; overflow: hidden; display: flex; flex-direction: column; }
            .db-head { padding: 14px 18px; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
            .db-body { padding: 14px 18px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; overflow: auto; }
            .db-card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 12px; }
            .db-card h4 { margin: 0 0 8px; font-size: 13px; }
            .db-input, .db-textarea { width: 100%; box-sizing: border-box; border: 1px solid #d1d5db; border-radius: 8px; padding: 8px 10px; font-size: 12px; }
            .db-textarea { min-height: 150px; resize: vertical; font-family: Consolas, monospace; }
            .db-actions { display: flex; gap: 8px; margin-top: 10px; }
            .db-a-btn { border: 1px solid #cbd5e1; background: #fff; border-radius: 8px; font-size: 12px; padding: 8px 10px; cursor: pointer; }
            .db-a-btn.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
            .db-log { white-space: pre-wrap; font-family: Consolas, monospace; background: #0b1020; color: #dbeafe; border-radius: 8px; padding: 10px; min-height: 86px; font-size: 12px; }
            .db-msg-list { max-height: 360px; overflow: auto; border: 1px solid #e5e7eb; border-radius: 8px; }
            .db-msg-item { padding: 10px; border-bottom: 1px solid #f1f5f9; }
            .db-msg-item:last-child { border-bottom: none; }
            .db-role { font-size: 11px; font-weight: 700; margin-bottom: 4px; }
            .db-role.user { color: #0369a1; }
            .db-role.assistant { color: #7c3aed; }
            .db-text { font-size: 12px; line-height: 1.6; color: #334155; white-space: pre-wrap; }
            .db-recent-list { max-height: 300px; overflow: auto; border: 1px solid #e5e7eb; border-radius: 8px; }
            .db-recent-item { display: flex; gap: 8px; align-items: flex-start; padding: 10px; border-bottom: 1px solid #f1f5f9; }
            .db-recent-item:last-child { border-bottom: none; }
            .db-recent-title { font-size: 12px; color: #0f172a; line-height: 1.5; }
            .db-recent-meta { font-size: 11px; color: #64748b; margin-top: 2px; }
        `);

        const btn = document.createElement('button');
        btn.className = 'db-test-btn';
        btn.textContent = '豆包API测试';
        document.body.appendChild(btn);

        btn.addEventListener('click', () => {
            const convId = getConvIdFromUrl();
            const overlay = document.createElement('div');
            overlay.className = 'db-mask';

            overlay.innerHTML = `
                <div class="db-modal">
                    <div class="db-head">
                        <div style="font-weight:700;">豆包 /im/chain/single 测试面板</div>
                        <button id="db-close" class="db-a-btn">关闭</button>
                    </div>
                    <div class="db-body">
                        <div class="db-card">
                            <h4>请求配置</h4>
                            <label style="font-size:12px;display:block;margin-bottom:6px;">会话ID</label>
                            <input id="db-conv-id" class="db-input" value="${convId}" />
                            <label style="font-size:12px;display:block;margin:10px 0 6px;">请求URL（可改）</label>
                            <input id="db-url" class="db-input" value="${ensureChainSingleQuery(capturedTemplate?.url || `${location.origin}/im/chain/single`) }" />
                            <label style="font-size:12px;display:block;margin:10px 0 6px;">请求体 JSON（留空将自动生成）</label>
                            <textarea id="db-body" class="db-textarea" placeholder="例如: {\n  \"conversation_id\": \"...\",\n  \"msg_cursor\": \"0\"\n}"></textarea>
                            <div class="db-actions">
                                <button id="db-run" class="db-a-btn primary">发起请求</button>
                                <button id="db-fill" class="db-a-btn">填充默认体</button>
                                <button id="db-copy" class="db-a-btn">复制原始响应</button>
                            </div>
                        </div>
                        <div class="db-card">
                            <h4>请求结果</h4>
                            <div id="db-log" class="db-log">等待发起请求...</div>
                            <h4 style="margin-top:10px;">解析后的消息</h4>
                            <div id="db-list" class="db-msg-list"></div>
                        </div>
                        <div class="db-card" style="grid-column: 1 / -1;">
                            <h4>历史对话批量导出（recent_conv -> chain/single）</h4>
                            <label style="font-size:12px;display:block;margin:8px 0 6px;">recent_conv URL（建议粘贴浏览器真实请求 URL）</label>
                            <input id="db-recent-url" class="db-input" value="${escapeHtml(capturedRecentConvUrl || ensureRecentConvQuery(`${location.origin}/im/chain/recent_conv`, getOrCreateWebTabId(), false))}" />
                            <div class="db-actions" style="flex-wrap:wrap;">
                                <button id="db-load-recent" class="db-a-btn">加载历史对话</button>
                                <button id="db-sel-all" class="db-a-btn">全选</button>
                                <button id="db-sel-none" class="db-a-btn">清空</button>
                                <button id="db-export-json" class="db-a-btn primary">批量导出 JSON</button>
                                <button id="db-export-md" class="db-a-btn">导出 Markdown</button>
                                <button id="db-export-txt" class="db-a-btn">导出 TXT</button>
                            </div>
                            <div id="db-recent" class="db-recent-list" style="margin-top:10px;"></div>
                        </div>
                    </div>
                </div>
            `;

            const close = () => {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            };

            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) close();
            });
            overlay.querySelector('#db-close').addEventListener('click', close);

            const logEl = overlay.querySelector('#db-log');
            const listEl = overlay.querySelector('#db-list');
            const recentEl = overlay.querySelector('#db-recent');
            let lastRaw = '';
            let recentConversations = [];

            function renderRecentList() {
                if (!recentConversations.length) {
                    recentEl.innerHTML = '<div class="db-msg-item">暂无历史会话，请先点击“加载历史对话”。</div>';
                    return;
                }

                recentEl.innerHTML = recentConversations.map((c) => `
                    <label class="db-recent-item">
                        <input type="checkbox" class="db-recent-ck" data-id="${escapeHtml(c.id)}" checked>
                        <div style="flex:1;min-width:0;">
                            <div class="db-recent-title">${escapeHtml(c.title || `会话 ${c.id}`)}</div>
                            <div class="db-recent-meta">ID: ${escapeHtml(c.id)}${Number.isFinite(c.badgeCount) ? ` | 消息数量: ${escapeHtml(String(c.badgeCount))}` : ''}${c.createdAtText ? ` | 创建时间: ${escapeHtml(c.createdAtText)}` : ''}${c.updatedAtText ? ` | 更新时间: ${escapeHtml(c.updatedAtText)}` : ''}</div>
                        </div>
                    </label>
                `).join('');
            }

            function getSelectedConversations() {
                const map = new Map(recentConversations.map((c) => [c.id, c]));
                return Array.from(recentEl.querySelectorAll('.db-recent-ck:checked'))
                    .map((el) => map.get(el.getAttribute('data-id')))
                    .filter(Boolean);
            }

            async function runBatchExport(format) {
                const selected = getSelectedConversations();
                if (!selected.length) {
                    alert('请先勾选至少一个历史会话');
                    return;
                }

                const customBody = overlay.querySelector('#db-body').value;
                const customUrl = overlay.querySelector('#db-url').value.trim();
                const out = [];

                logEl.textContent = `准备批量导出，共 ${selected.length} 个会话...`;

                for (let i = 0; i < selected.length; i += 1) {
                    const conv = selected[i];
                    logEl.textContent += `\n\n[${i + 1}/${selected.length}] 拉取会话: ${conv.title} (${conv.id})`;
                    try {
                        const allRes = await fetchAllConversationMessages(conv.id, {
                            customBodyText: customBody,
                            customUrl,
                            maxPages: 30,
                            onProgress: (p) => {
                                logEl.textContent += `\n  - page ${p.page}, messages=${p.count}, hasMore=${p.hasMore}`;
                            }
                        });
                        out.push({
                            conversationId: conv.id,
                            title: conv.title,
                            updatedAt: conv.updatedAt || 0,
                            updatedAtText: conv.updatedAtText || '',
                            pages: allRes.pages,
                            messageCount: allRes.messages.length,
                            messages: allRes.messages
                        });
                        logEl.textContent += `\n  -> 完成，会话消息数: ${allRes.messages.length}`;
                    } catch (e) {
                        logEl.textContent += `\n  -> 失败: ${e.message || String(e)}`;
                    }
                }

                if (!out.length) {
                    logEl.textContent += '\n\n无可导出的会话数据';
                    return;
                }

                const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_');
                if (format === 'json') {
                    const content = JSON.stringify({
                        platform: 'Doubao',
                        exportedAt: new Date().toISOString(),
                        conversationCount: out.length,
                        conversations: out
                    }, null, 2);
                    downloadFile(`doubao_batch_export_${stamp}.json`, content, 'application/json;charset=utf-8');
                } else if (format === 'md') {
                    const content = out.map((c, i) => {
                        const header = `# ${i + 1}. ${c.title}\n\n- 会话ID: ${c.conversationId}\n- 更新时间: ${c.updatedAtText || '-'}\n- 消息数: ${c.messageCount}\n`;
                        const body = c.messages.map((m, idx) => `\n## ${idx + 1}. ${m.role === 'user' ? '用户' : '豆包'}\n\n${m.text || ''}\n`).join('\n');
                        return `${header}\n${body}`;
                    }).join('\n\n---\n\n');
                    downloadFile(`doubao_batch_export_${stamp}.md`, content, 'text/markdown;charset=utf-8');
                } else {
                    const content = out.map((c, i) => {
                        const header = `${i + 1}. ${c.title}\n会话ID: ${c.conversationId}\n更新时间: ${c.updatedAtText || '-'}\n消息数: ${c.messageCount}`;
                        const body = c.messages.map((m, idx) => `\n[${idx + 1}] ${m.role === 'user' ? '用户' : '豆包'}\n${m.text || ''}`).join('\n');
                        return `${header}\n${body}`;
                    }).join('\n\n==============================\n\n');
                    downloadFile(`doubao_batch_export_${stamp}.txt`, content, 'text/plain;charset=utf-8');
                }

                logEl.textContent += `\n\n批量导出完成，成功会话数: ${out.length}`;
            }

            overlay.querySelector('#db-fill').addEventListener('click', () => {
                const id = overlay.querySelector('#db-conv-id').value.trim();
                overlay.querySelector('#db-body').value = JSON.stringify(buildDefaultRequest(id).body, null, 2);
            });

            overlay.querySelector('#db-copy').addEventListener('click', async () => {
                if (!lastRaw) return;
                try {
                    await navigator.clipboard.writeText(lastRaw);
                    logEl.textContent += '\n\n已复制原始响应到剪贴板';
                } catch (e) {
                    logEl.textContent += '\n\n复制失败：' + (e.message || String(e));
                }
            });

            overlay.querySelector('#db-run').addEventListener('click', async () => {
                const conv = overlay.querySelector('#db-conv-id').value.trim();
                const customBody = overlay.querySelector('#db-body').value;
                const customUrl = overlay.querySelector('#db-url').value.trim();

                if (!conv) {
                    alert('会话ID不能为空');
                    return;
                }

                try {
                    const req = buildRequest(conv, customBody);
                    if (customUrl) req.url = ensureChainSingleQuery(customUrl);

                    logEl.textContent = [
                        '准备请求...',
                        `URL: ${req.url}`,
                        `Headers: ${JSON.stringify(req.headers, null, 2)}`,
                        `Body: ${JSON.stringify(req.body, null, 2)}`
                    ].join('\n\n');

                    const resp = await fetch(req.url, {
                        method: 'POST',
                        credentials: 'include',
                        headers: req.headers,
                        body: JSON.stringify(req.body)
                    });

                    const text = await resp.text();
                    lastRaw = text;
                    const json = safeParseJson(text);

                    if (!resp.ok) {
                        logEl.textContent += `\n\nHTTP ${resp.status} ${resp.statusText}\n${text.slice(0, 1200)}`;
                        return;
                    }

                    if (!json) {
                        logEl.textContent += '\n\n响应不是 JSON';
                        return;
                    }

                    const parsed = parseMessagesFromResponse(json);
                    logEl.textContent += [
                        '',
                        `请求成功: HTTP ${resp.status}`,
                        `status_code: ${json.status_code}`,
                        `messages: ${parsed.length}`
                    ].join('\n');

                    if (Number(json.status_code) !== 0) {
                        const ctype = req?.body?.uplink_body?.pull_singe_chain_uplink_body?.conversation_type;
                        if (String(ctype || '') === conv) {
                            logEl.textContent += '\n\n提示: conversation_type 不应等于 conversation_id，请改为 0/1 等枚举值后重试。';
                        }
                    }

                    listEl.innerHTML = parsed.map((m, idx) => `
                        <div class="db-msg-item">
                            <div class="db-role ${m.role}">${idx + 1}. ${m.role === 'user' ? '用户' : '豆包'} | id=${escapeHtml(m.id)}</div>
                            <div class="db-text">${escapeHtml(m.text)}</div>
                        </div>
                    `).join('') || '<div class="db-msg-item">未解析到消息，请检查请求体字段。</div>';
                } catch (e) {
                    logEl.textContent += `\n\n请求失败: ${e.message || String(e)}`;
                }
            });

            overlay.querySelector('#db-load-recent').addEventListener('click', async () => {
                try {
                    const customRecentUrl = overlay.querySelector('#db-recent-url').value.trim();
                    logEl.textContent = '正在请求 recent_conv 历史列表...';
                    const result = await fetchRecentConversations(customRecentUrl);
                    recentConversations = result.conversations;
                    renderRecentList();
                    logEl.textContent += `\n\n请求成功: ${result.url}\n会话数量: ${recentConversations.length}`;
                } catch (e) {
                    logEl.textContent += `\n\n加载历史会话失败: ${e.message || String(e)}`;
                }
            });

            overlay.querySelector('#db-sel-all').addEventListener('click', () => {
                recentEl.querySelectorAll('.db-recent-ck').forEach((ck) => {
                    ck.checked = true;
                });
            });

            overlay.querySelector('#db-sel-none').addEventListener('click', () => {
                recentEl.querySelectorAll('.db-recent-ck').forEach((ck) => {
                    ck.checked = false;
                });
            });

            overlay.querySelector('#db-export-json').addEventListener('click', () => runBatchExport('json'));
            overlay.querySelector('#db-export-md').addEventListener('click', () => runBatchExport('md'));
            overlay.querySelector('#db-export-txt').addEventListener('click', () => runBatchExport('txt'));

            renderRecentList();

            document.body.appendChild(overlay);
        });
    }

    installCaptureHooks();
    mountUI();
    log('脚本已加载。先在页面正常收发一条消息可提升模板捕获成功率。');
})();
