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
    const isDoubao = /^www\.doubao\.com$/i.test(host) && /^\/chat(?:\/[^/?#]+)?\/?$/i.test(path);
    if (!isDoubao) return;

    let capturedTemplate = null;
    let capturedRecentConvUrl = '';
    let captureInstalled = false;
    let apiNodes = [];
    let domNodes = [];
    let lastApiFetchStats = [];
    let readingLineRatio = 0.42;
    let testPanel = null;
    let railWrap = null;
    let outputEl = null;
    let statusEl = null;
    let railDots = [];
    let activeApiIndex = -1;
    let activeRefreshPending = false;
    let activeRefreshTimer = null;
    let jumpTaskSeq = 0;
    let domMutationDebounceTimer = null;
    let autoApiRefreshTimer = null;
    let autoApiRefreshInFlight = false;
    let lastAutoApiRefreshAt = 0;

    function normalizeText(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim();
    }

    function normalizeMessageId(rawId) {
        const id = String(rawId || '').trim();
        if (!id) return '';
        return id
            .replace(/[-_:]?(question|answer|assistant|receive|send)$/i, '')
            .replace(/-(u|a)-\d+$/i, '')
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
        try {
            const u = new URL(window.location.href);
            const fromQuery = String(
                u.searchParams.get('conversation_id')
                || u.searchParams.get('chat_id')
                || u.searchParams.get('session_id')
                || ''
            ).trim();
            if (fromQuery) return fromQuery;
        } catch (_) {}
        const m = String(window.location.pathname || '').match(/\/chat\/([^/?#]+)/i);
        return m ? String(m[1] || '').trim() : '';
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

    function buildRequest(convId, msgCursor = '', anchorIndex = null, forceLatestStart = false) {
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
        pull.limit = 50;

        if (forceLatestStart) {
            // 关键修复：首包强制从最新侧起点拉取，避免继承中间滚动态模板导致“只能拿到旧侧尾部”。
            if ('msg_cursor' in pull) delete pull.msg_cursor;
            pull.anchor_index = Number.MAX_SAFE_INTEGER;
            pull.direction = 1;
        } else {
            if (msgCursor) pull.msg_cursor = String(msgCursor);
            else if ('msg_cursor' in pull) delete pull.msg_cursor;
            if (anchorIndex != null && Number.isFinite(Number(anchorIndex))) {
                pull.anchor_index = Number(anchorIndex);
            }
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

        function collectAttachmentsFromNode(node, out) {
            if (!node) return;
            if (Array.isArray(node)) {
                node.forEach((n) => collectAttachmentsFromNode(n, out));
                return;
            }
            if (typeof node !== 'object') return;

            const attachments = node?.content?.attachment_block?.attachments;
            if (Array.isArray(attachments)) {
                attachments.forEach((a) => {
                    const typeNum = Number(a?.type);
                    const identifier = String(a?.identifier || '').trim();
                    const imageObj = a?.image || {};
                    const fileObj = a?.file || {};

                    if (typeNum === 1 || imageObj?.uri || imageObj?.image_ori?.url || imageObj?.name) {
                        const key = String(imageObj?.uri || imageObj?.key || '').trim();
                        const name = String(imageObj?.name || '').trim();
                        const url = String(imageObj?.image_ori?.url || imageObj?.image_thumb?.url || imageObj?.image_preview?.url || '').trim();
                        out.push({
                            kind: 'image',
                            identifier,
                            key,
                            name,
                            url
                        });
                        return;
                    }

                    if (typeNum === 3 || fileObj?.name || fileObj?.uri) {
                        const key = String(fileObj?.uri || fileObj?.key || '').trim();
                        const name = String(fileObj?.name || '').trim();
                        const url = String(fileObj?.url || '').trim();
                        out.push({
                            kind: 'file',
                            identifier,
                            key,
                            name,
                            url
                        });
                    }
                });
            }

            Object.values(node).forEach((v) => collectAttachmentsFromNode(v, out));
        }

        function collectAttachmentsFromTtsContent(rawTts, out) {
            if (typeof rawTts !== 'string' || !rawTts.trim()) return;
            const parsed = safeParseJson(rawTts);
            const entities = Array.isArray(parsed?.entities) ? parsed.entities : [];
            entities.forEach((e) => {
                const et = Number(e?.entity_type);
                const identifier = String(e?.identifier || '').trim();
                if (et === 2) {
                    const image = e?.entity_content?.image || {};
                    out.push({
                        kind: 'image',
                        identifier,
                        key: String(image?.key || '').trim(),
                        name: '',
                        url: String(image?.image_ori?.url || '').trim()
                    });
                } else if (et === 1) {
                    const file = e?.entity_content?.file || {};
                    out.push({
                        kind: 'file',
                        identifier,
                        key: String(file?.key || '').trim(),
                        name: String(file?.file_name || '').trim(),
                        url: ''
                    });
                }
            });
        }

        function dedupeAttachments(list) {
            const merged = new Map();
            list.forEach((a) => {
                if (!a) return;
                const idKey = String(a.identifier || '').trim();
                const fallback = `${a.kind}|${a.key || ''}|${a.name || ''}|${a.url || ''}`;
                const mergeKey = idKey ? `${a.kind}|id:${idKey}` : fallback;
                if (!merged.has(mergeKey)) {
                    merged.set(mergeKey, { ...a });
                    return;
                }
                const old = merged.get(mergeKey) || {};
                merged.set(mergeKey, {
                    ...old,
                    kind: old.kind || a.kind,
                    identifier: old.identifier || a.identifier,
                    key: old.key || a.key,
                    name: old.name || a.name,
                    url: old.url || a.url
                });
            });
            return Array.from(merged.values());
        }

        function buildAttachmentLabel(a) {
            const name = String(a?.name || '').trim();
            const key = String(a?.key || '').trim();
            const identifier = String(a?.identifier || '').trim();
            if (name && key && /^image\.[a-z0-9]+$/i.test(name)) return `${name} (${key})`;
            return name || key || identifier || 'attachment';
        }

        function buildAttachmentSummary(attachments) {
            if (!attachments.length) return '';
            const imageTags = attachments
                .filter((a) => a.kind === 'image')
                .map((a) => buildAttachmentLabel(a));
            const fileTags = attachments
                .filter((a) => a.kind === 'file')
                .map((a) => buildAttachmentLabel(a));
            const lines = [];
            if (imageTags.length) lines.push(`[图片 x${imageTags.length}] ${imageTags.join(', ')}`);
            if (fileTags.length) lines.push(`[文件 x${fileTags.length}] ${fileTags.join(', ')}`);
            return lines.join(' | ');
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
            const attachmentsRaw = [];
            collectAttachmentsFromNode(Array.isArray(m?.content_block) ? m.content_block : [], attachmentsRaw);
            collectAttachmentsFromTtsContent(m?.tts_content || '', attachmentsRaw);
            const attachments = dedupeAttachments(attachmentsRaw);
            const attachmentSummary = buildAttachmentSummary(attachments);
            const blockText = normalizeUserText(
                (Array.isArray(m?.content_block) ? m.content_block : [])
                    .map((b) => collectTextFromBlock(b))
                    .filter(Boolean)
                    .join('\n\n')
            );
            const contentText = extractTextFromContentField(m?.content || '');
            const ttsText = normalizeUserText(m?.tts_content || '');
            const text = normalizeUserText(blockText || contentText || ttsText);
            const displayText = normalizeUserText([text, attachmentSummary].filter(Boolean).join('\n'));
            return {
                id: m?.message_id || '',
                role,
                index: Number(m?.index_in_conv || 0),
                text,
                displayText,
                attachmentSummary,
                attachments
            };
        }).filter((m) => m.text || (Array.isArray(m.attachments) && m.attachments.length > 0));
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
            const req = buildRequest(convId, msgCursor, anchorIndex, page === 1);
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
                    text: normalizeText(m.displayText || m.text || ''),
                    matchText: normalizeText(m.text || ''),
                    sourceMessageId: String(m.id || `${page}-${i + 1}`),
                    index: Number(m.index || 0),
                    attachmentSummary: normalizeText(m.attachmentSummary || '')
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
            .map(({ id, text, matchText, sourceMessageId, attachmentSummary }) => ({ id, text, matchText, sourceMessageId, attachmentSummary }));

        if (!apiNodes.length && !hasCapturedTemplate) {
            throw new Error('API 返回为空。当前未捕获到 /im/chain/single 模板，请先在豆包发送一条新消息后重试。');
        }
        return apiNodes;
    }

    function isSidebarElement(el) {
        if (!el || !el.closest) return false;
        return Boolean(
            el.closest(
                '#flow_chat_sidebar, nav[class*="left-side"], nav[data-testid*="leftside"], aside, [class*="sidebar"], [class*="sider"]'
            )
        );
    }

    function getPrimaryMessageRoot() {
        const candidates = Array.from(document.querySelectorAll('[data-target-id="message-box-target-id"], .message-list-S2Fv2S, [class*="message-list-"]'))
            .filter((el) => !isSidebarElement(el));
        if (!candidates.length) return null;
        let best = null;
        let bestCount = -1;
        candidates.forEach((el) => {
            const count = el.querySelectorAll('[data-testid="send_message"], [data-testid="receive_message"], [data-message-id]').length;
            if (count > bestCount) {
                best = el;
                bestCount = count;
            }
        });
        return best;
    }

    function getDomRows() {
        const root = getPrimaryMessageRoot();
        const base = root || document;
        const rows = Array.from(base.querySelectorAll('[data-testid="send_message"], [data-testid="receive_message"], [data-target-id="message-box-target-id"]'))
            .filter((row) => !isSidebarElement(row))
            .filter((row) => {
                const testId = String(row.getAttribute('data-testid') || '').toLowerCase();
                if (testId === 'send_message' || testId === 'receive_message') return true;
                return Boolean(row.querySelector('[data-message-id]'));
            });
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

        const normalizeLines = (raw) => String(raw || '')
            .split(/\r?\n+/)
            .map((line) => normalizeText(line))
            .filter(Boolean)
            .filter((line) => {
                if (!line) return false;
                if (/^(查看|复制|重试|分享|进入\s*AI\s*阅读)$/i.test(line)) return false;
                if (/^内容由豆包\s*AI\s*生成$/i.test(line)) return false;
                if (/^(PDF|DOCX?|XLSX?|PPTX?|TXT|CSV)\b/i.test(line)) return false;
                if (/^\d+(\.\d+)?\s*(KB|MB|GB)\b/i.test(line)) return false;
                if (/^约\s*\d+/.test(line)) return false;
                return true;
            });

        const pickBestLine = (raw) => {
            const lines = normalizeLines(raw);
            if (!lines.length) return '';
            const sorted = lines.slice().sort((a, b) => b.length - a.length);
            return sorted[0] || lines[0] || '';
        };

        // 新版豆包：优先读取发送气泡文本。
        const bubbleText = pickBestLine(
            row.querySelector('[class*="send-msg-bubble"]')?.innerText
            || row.querySelector('[data-plugin-identifier*="send"] .whitespace-pre-wrap')?.innerText
            || ''
        );
        if (bubbleText) return normalizeText(bubbleText);

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

        // 兜底：从 data-message-id 容器里提炼最可信的一行用户文本。
        const messageBlockText = pickBestLine(
            row.querySelector('[data-message-id]')?.innerText
            || row.innerText
            || ''
        );
        if (messageBlockText && !isTrivialSkillPrompt(messageBlockText)) return normalizeText(messageBlockText);

        return refText || fullText || plainText || messageBlockText || '';
    }

    function getRowRole(row) {
        if (!row) return 'unknown';
        const testId = String(row.getAttribute('data-testid') || '').toLowerCase();
        if (testId === 'send_message') return 'send';
        if (testId === 'receive_message') return 'receive';

        if (row.querySelector('[data-plugin-identifier*="receive"]')) return 'receive';
        if (row.querySelector('[data-plugin-identifier*="send"]')) return 'send';
        if (row.querySelector('[data-foundation-type="receive-message-action-bar"]')) return 'receive';
        if (row.querySelector('[class*="justify-end"]')) return 'send';
        return 'unknown';
    }

    function getRowMessageId(row) {
        if (!row) return '';
        const byTestIdNode = String(
            row.querySelector('[data-testid="message_content"]')?.getAttribute('data-message-id')
            || row.getAttribute('data-id')
            || ''
        ).trim();
        if (byTestIdNode) return byTestIdNode;
        return String(
            row.querySelector('[data-message-id]')?.getAttribute('data-message-id')
            || row.getAttribute('data-message-id')
            || ''
        ).trim();
    }

    function scanDomNodes() {
        const out = [];
        const seen = new Set();
        getDomRows().forEach((row, idx) => {
            if (getRowRole(row) !== 'send') return;
            const text = extractUserTextFromSendRow(row);
            if (!text) return;
            const messageId = getRowMessageId(row);
            const rid = String(row.getAttribute('data-id') || messageId || `dom-user-${idx + 1}`);
            const key = `${rid}::${text.slice(0, 80)}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push({
                id: `dom-user-${rid}`,
                rowId: rid,
                text,
                element: row.querySelector('[data-testid="message_content"]')
                    || row.querySelector('[data-message-id]')
                    || row
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

        const targetText = normalizeText(apiNode.matchText || apiNode.text);
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

    function sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function getScrollContainer() {
        const candidates = [
            document.querySelector('.scrollable-Se7zNt'),
            document.querySelector('[class*="scrollable-"]'),
            document.querySelector('.scroll-view-OEiNXD'),
            document.querySelector('[class*="scroll-view-"]'),
            getPrimaryMessageRoot(),
            document.querySelector('[data-testid="chat_content"]'),
            document.querySelector('[data-testid="send_message"]'),
            document.querySelector('[data-message-id]'),
            document.querySelector('main[data-container-name="main"]'),
            document.querySelector('main')
        ].filter(Boolean).filter((el) => !isSidebarElement(el));
        for (const base of candidates) {
            let p = base;
            while (p && p !== document.body) {
                const s = window.getComputedStyle(p);
                if (
                    !isSidebarElement(p)
                    && (s.overflowY === 'auto' || s.overflowY === 'scroll')
                    && (p.scrollHeight - p.clientHeight > 20)
                ) return p;
                p = p.parentElement;
            }
        }
        return document.scrollingElement || document.documentElement;
    }

    function getReadingLineY() {
        return Math.round(window.innerHeight * readingLineRatio);
    }

    function renderReadingLine() {
        let line = document.getElementById('db-test-reading-line');
        if (!line) {
            line = document.createElement('div');
            line.id = 'db-test-reading-line';
            line.style.cssText = [
                'position:fixed',
                'left:0',
                'right:0',
                'height:0',
                'border-top:1px dashed rgba(34,197,94,.65)',
                'pointer-events:none',
                'z-index:2147483642'
            ].join(';');
            document.body.appendChild(line);
        }
        line.style.top = `${getReadingLineY()}px`;
    }

    function setStatus(s) {
        if (statusEl) statusEl.textContent = s;
    }

    function print(text) {
        if (outputEl) outputEl.textContent = text;
    }

    function hashCode(input) {
        const s = String(input || '');
        let h = 0;
        for (let i = 0; i < s.length; i += 1) {
            h = ((h << 5) - h) + s.charCodeAt(i);
            h |= 0;
        }
        return h;
    }

    function hasApiNodeForDom(sourceMessageId, text) {
        const sid = normalizeMessageId(sourceMessageId || '');
        const t = normalizeText(text || '');
        return apiNodes.some((n) => {
            const nid = normalizeMessageId(n?.sourceMessageId || n?.id || '');
            const nt = normalizeText(n?.text || '');
            if (sid && nid && (sid === nid || sid.includes(nid) || nid.includes(sid))) return true;
            if (!t || !nt) return false;
            if (nt === t) return true;
            const p = t.slice(0, Math.min(24, t.length));
            return Boolean(p && nt.includes(p));
        });
    }

    function reconcilePendingNodesWithApi() {
        if (!apiNodes.length) return;
        const next = [];
        const seen = new Set();
        apiNodes.forEach((n) => {
            if (!n) return;
            const id = String(n.id || '').trim();
            const sid = normalizeMessageId(n.sourceMessageId || '');
            const txt = normalizeText(n.text || '');
            const isPending = id.startsWith('dom-pending-');
            if (isPending && hasApiNodeForDom(sid, txt)) return;
            const key = `${sid || id}::${txt.slice(0, 64)}`;
            if (seen.has(key)) return;
            seen.add(key);
            next.push(n);
        });
        apiNodes = next;
    }

    function upsertPendingNodeFromDom() {
        const rows = getDomRows();
        let added = 0;
        rows.forEach((row, idx) => {
            if (getRowRole(row) !== 'send') return;
            const text = extractUserTextFromSendRow(row);
            if (!text) return;
            const messageId = getRowMessageId(row);
            const rowId = String(row.getAttribute('data-id') || messageId || '').trim();
            const baseId = normalizeMessageId(rowId || messageId || '');
            if (hasApiNodeForDom(baseId || rowId, text)) return;
            const id = `dom-pending-${baseId || idx + 1}-${Math.abs(hashCode(text)).toString(16).slice(0, 8)}`;
            if (apiNodes.some((n) => String(n?.id || '') === id)) return;
            apiNodes.push({
                id,
                sourceMessageId: baseId || rowId || '',
                text: normalizeText(text),
                matchText: normalizeText(text),
                pendingDomOnly: true
            });
            added += 1;
        });
        if (added > 0) {
            renderRail();
            refreshActiveNodeState();
            setStatus(`dom-pending+${added}`);
        }
    }

    function hasCompletedAnswerForQuestion(baseId) {
        if (!baseId) return false;
        const rows = getDomRows();
        return rows.some((row) => {
            if (getRowRole(row) !== 'receive') return false;
            const rowId = String(row.getAttribute('data-id') || '').trim();
            const msgId = getRowMessageId(row);
            const answerBaseId = normalizeMessageId(rowId || msgId);
            if (!answerBaseId || answerBaseId !== baseId) return false;
            if (row.querySelector('[aria-busy="true"], [class*="typing"], [class*="loading"], [class*="stream"], [class*="generating"]')) return false;
            const txt = normalizeText(
                row.querySelector('[data-testid="message_text_content"]')?.innerText
                || row.querySelector('[data-testid="message_content"]')?.innerText
                || row.innerText
            );
            if (!txt) return false;
            if (/^(思考中|生成中|回答中|typing|loading)\b/i.test(txt)) return false;
            return txt.length >= 2;
        });
    }

    async function runAutoApiRefreshFromDom() {
        if (autoApiRefreshInFlight) return;
        const now = Date.now();
        if (now - lastAutoApiRefreshAt < 1200) return;
        const pending = apiNodes.filter((n) => n && n.pendingDomOnly);
        if (!pending.length) return;
        const ready = pending.some((n) => hasCompletedAnswerForQuestion(normalizeMessageId(n.sourceMessageId || '')));
        if (!ready) return;

        autoApiRefreshInFlight = true;
        lastAutoApiRefreshAt = now;
        setStatus('auto-api');
        try {
            const list = await fetchApiNodes();
            apiNodes = Array.isArray(list) ? list : [];
            reconcilePendingNodesWithApi();
            renderRail();
            refreshActiveNodeState();
            setStatus('auto-api-ok');
        } catch (e) {
            setStatus('auto-api-fail');
            print(`自动 API 刷新失败: ${String(e?.message || e)}`);
        } finally {
            autoApiRefreshInFlight = false;
        }
    }

    function scheduleDomDrivenSync() {
        if (domMutationDebounceTimer) clearTimeout(domMutationDebounceTimer);
        domMutationDebounceTimer = setTimeout(() => {
            domMutationDebounceTimer = null;
            try {
                upsertPendingNodeFromDom();
                if (autoApiRefreshTimer) clearTimeout(autoApiRefreshTimer);
                autoApiRefreshTimer = setTimeout(() => {
                    autoApiRefreshTimer = null;
                    runAutoApiRefreshFromDom();
                }, 900);
            } catch (_) {
                // ignore
            }
        }, 220);
    }

    function renderRail() {
        if (!railWrap) return;
        const content = railWrap.querySelector('[data-role="rail-content"]');
        if (!content) return;
        content.innerHTML = '';
        if (!apiNodes.length) return;

        const track = document.createElement('div');
        track.style.cssText = [
            'position:absolute',
            'left:11px',
            'top:8px',
            'bottom:8px',
            'width:2px',
            'background:linear-gradient(180deg,#93c5fd,#1d4ed8)',
            'opacity:.45'
        ].join(';');
        content.appendChild(track);

        railDots = [];
        apiNodes.forEach((node, idx) => {
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.title = `[${idx + 1}] ${shortText(node.text, 70)}`;
            dot.textContent = String(idx + 1);
            dot.dataset.apiIndex = String(idx);
            dot.style.cssText = [
                'position:relative',
                'margin:0',
                'padding:0',
                'width:24px',
                'height:24px',
                'border-radius:999px',
                'border:1px solid rgba(148,163,184,.45)',
                'background:rgba(15,23,42,.9)',
                'color:#e2e8f0',
                'font:600 10px/1.1 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
                'cursor:pointer',
                'display:block',
                'transition:all .2s ease',
                'margin-bottom:8px'
            ].join(';');
            dot.addEventListener('mouseenter', () => {
                dot.style.transform = 'scale(1.08)';
                dot.style.borderColor = 'rgba(125,211,252,.95)';
            });
            dot.addEventListener('mouseleave', () => {
                dot.style.transform = 'scale(1)';
                dot.style.borderColor = 'rgba(148,163,184,.45)';
            });
            content.appendChild(dot);
            railDots.push(dot);
        });
        content.onclick = async (e) => {
            const dot = e.target && e.target.closest ? e.target.closest('button[data-api-index]') : null;
            if (!dot) return;
            const idx = Number(dot.dataset.apiIndex || -1);
            if (!Number.isInteger(idx) || idx < 0 || idx >= apiNodes.length) return;
            const token = ++jumpTaskSeq;
            await jumpToApiNode(apiNodes[idx], idx, token);
        };
        applyRailActiveState();
    }

    async function alignToReadingLine(el) {
        if (!el) return;
        const sc = getScrollContainer();
        const r = el.getBoundingClientRect();
        const anchorY = r.top + Math.min(Math.max(r.height * 0.35, 16), 80);
        const diff = anchorY - getReadingLineY();
        if (Math.abs(diff) < 4) return;
        if (sc === document.scrollingElement || sc === document.documentElement) {
            window.scrollBy({ top: diff, behavior: 'smooth' });
        } else {
            sc.scrollBy({ top: diff, behavior: 'smooth' });
        }
        await sleep(220);
    }

    function getAnchorDeltaToReadingLine(el) {
        if (!el || !document.body.contains(el)) return Number.POSITIVE_INFINITY;
        const r = el.getBoundingClientRect();
        const anchorY = r.top + Math.min(Math.max(r.height * 0.35, 16), 80);
        return anchorY - getReadingLineY();
    }

    async function settleAtReadingLine(el, maxSteps = 7, token = 0) {
        if (!el || !document.body.contains(el)) return { ok: false, delta: Number.POSITIVE_INFINITY };
        const sc = getScrollContainer();
        let lastDelta = getAnchorDeltaToReadingLine(el);
        for (let i = 0; i < maxSteps; i += 1) {
            if (token && token !== jumpTaskSeq) return { ok: false, delta: lastDelta };
            if (!Number.isFinite(lastDelta)) return { ok: false, delta: Number.POSITIVE_INFINITY };
            if (Math.abs(lastDelta) <= 8) return { ok: true, delta: lastDelta };
            const behavior = i < 2 ? 'smooth' : 'auto';
            if (sc === document.scrollingElement || sc === document.documentElement) {
                window.scrollBy({ top: lastDelta, behavior });
            } else {
                sc.scrollBy({ top: lastDelta, behavior });
            }
            await sleep(behavior === 'smooth' ? 210 : 90);
            lastDelta = getAnchorDeltaToReadingLine(el);
        }
        return { ok: Math.abs(lastDelta) <= 12, delta: lastDelta };
    }

    function locateApiIndexByDomNode(domNode) {
        if (!domNode || !apiNodes.length) return -1;
        const rowId = String(domNode.rowId || '').trim();
        if (rowId) {
            const byId = apiNodes.findIndex((node) => String(node?.sourceMessageId || node?.id || '').trim() === rowId);
            if (byId !== -1) return byId;
        }
        const targetText = normalizeText(domNode.text || '');
        if (!targetText) return -1;
        const prefix = targetText.slice(0, Math.min(32, targetText.length));
        let bestIndex = -1;
        let bestScore = -1;
        apiNodes.forEach((node, idx) => {
            const t = normalizeText(node?.text || '');
            if (!t) return;
            let score = 0;
            if (t === targetText) score += 10;
            if (prefix && (t.includes(prefix) || targetText.includes(t.slice(0, Math.min(24, t.length))))) score += 6;
            if (score > bestScore) {
                bestScore = score;
                bestIndex = idx;
            }
        });
        return bestScore >= 6 ? bestIndex : -1;
    }

    function computeActiveApiIndexFromViewport() {
        if (!apiNodes.length) return -1;
        const list = scanDomNodes();
        if (!list.length) return -1;
        const readingY = getReadingLineY();
        let bestDom = null;
        let bestDist = Infinity;
        list.forEach((n) => {
            const el = n?.element;
            if (!el || !document.body.contains(el)) return;
            const r = el.getBoundingClientRect();
            if (r.bottom < 0 || r.top > window.innerHeight) return;
            const centerY = r.top + Math.min(Math.max(r.height * 0.35, 12), 80);
            const dist = Math.abs(centerY - readingY);
            if (dist < bestDist) {
                bestDist = dist;
                bestDom = n;
            }
        });
        if (!bestDom) return -1;
        return locateApiIndexByDomNode(bestDom);
    }

    function setActiveApiIndex(nextIndex) {
        const idx = Number(nextIndex);
        if (!Number.isInteger(idx) || idx < 0 || idx >= apiNodes.length) return;
        if (idx === activeApiIndex) return;
        activeApiIndex = idx;
        applyRailActiveState();
        setStatus(`active-${idx + 1}`);
    }

    function applyRailActiveState() {
        if (!railDots.length) return;
        railDots.forEach((dot, idx) => {
            const isActive = idx === activeApiIndex;
            dot.style.background = isActive ? 'linear-gradient(180deg,#22d3ee,#0ea5e9)' : 'rgba(15,23,42,.9)';
            dot.style.color = isActive ? '#042f2e' : '#e2e8f0';
            dot.style.borderColor = isActive ? 'rgba(34,211,238,.95)' : 'rgba(148,163,184,.45)';
            dot.style.boxShadow = isActive ? '0 0 0 3px rgba(34,211,238,.22)' : 'none';
        });
    }

    function inferSearchDirection(targetApiIndex) {
        if (Number.isInteger(activeApiIndex) && activeApiIndex >= 0) {
            return targetApiIndex >= activeApiIndex ? 'down' : 'up';
        }
        const liveIdx = computeActiveApiIndexFromViewport();
        if (liveIdx !== -1) return targetApiIndex >= liveIdx ? 'down' : 'up';
        return 'down';
    }

    function getScrollTopOf(sc) {
        return sc === document.scrollingElement || sc === document.documentElement
            ? window.scrollY
            : sc.scrollTop;
    }

    function getScrollHeightOf(sc) {
        return sc === document.scrollingElement || sc === document.documentElement
            ? Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)
            : sc.scrollHeight;
    }

    function scrollByOn(sc, delta) {
        if (sc === document.scrollingElement || sc === document.documentElement) {
            window.scrollBy(0, delta);
        } else {
            sc.scrollTop += delta;
        }
    }

    function getDomProgressSignature(sc) {
        const rows = getDomRows();
        const firstId = rows.length ? String(rows[0].getAttribute('data-id') || '').trim() : '';
        const lastId = rows.length ? String(rows[rows.length - 1].getAttribute('data-id') || '').trim() : '';
        return `${rows.length}|${firstId}|${lastId}|${Math.round(getScrollTopOf(sc))}|${getScrollHeightOf(sc)}`;
    }

    function getDomApiIndexBounds(list = null) {
        const source = Array.isArray(list) ? list : scanDomNodes();
        if (!source.length) return { min: -1, max: -1 };
        const indices = source
            .map((n) => locateApiIndexByDomNode(n))
            .filter((v) => Number.isInteger(v) && v >= 0);
        if (!indices.length) return { min: -1, max: -1 };
        return { min: Math.min(...indices), max: Math.max(...indices) };
    }

    async function yieldToMainThread() {
        await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }

    async function triggerOlderHistoryLoad(sc, step, beforeSig = '', token = 0) {
        if (token !== jumpTaskSeq) return false;
        const kick = Math.max(150, Math.round(step * 0.34));
        scrollByOn(sc, -kick);
        await sleep(140);
        if (token !== jumpTaskSeq) return false;
        scrollByOn(sc, -kick);
        await sleep(180);

        const startSig = beforeSig || getDomProgressSignature(sc);
        const startedAt = Date.now();
        while (Date.now() - startedAt < 2300) {
            await sleep(140);
            await yieldToMainThread();
            if (token !== jumpTaskSeq) return false;
            const nowSig = getDomProgressSignature(sc);
            if (nowSig !== startSig) return true;
        }
        return false;
    }

    async function findTargetWithDirectionalScroll(apiNode, targetApiIndex, token = 0) {
        let currentDomList = scanDomNodes();
        let target = locateDomElementByApiNode(apiNode);
        if (target) return target;

        const sc = getScrollContainer();
        const step = Math.max(220, Math.round((sc.clientHeight || window.innerHeight) * 0.72));
        const initialBounds = getDomApiIndexBounds(currentDomList);
        const primaryDirection = initialBounds.min !== -1
            ? (targetApiIndex < initialBounds.min ? 'up' : (targetApiIndex > initialBounds.max ? 'down' : inferSearchDirection(targetApiIndex)))
            : inferSearchDirection(targetApiIndex);
        const goingDown = primaryDirection === 'down';
        let staleCount = 0;
        let noProgressRounds = 0;
        let lastSig = getDomProgressSignature(sc);
        const startedAt = Date.now();
        const maxDurationMs = 65000;
        let rounds = 0;

        while (Date.now() - startedAt < maxDurationMs) {
            rounds += 1;
            if (token !== jumpTaskSeq) return null;
            scrollByOn(sc, goingDown ? step : -step);
            await sleep(180);
            await yieldToMainThread();
            if (token !== jumpTaskSeq) return null;

            currentDomList = scanDomNodes();
            target = locateDomElementByApiNode(apiNode);
            if (target) return target;

            const liveIdx = computeActiveApiIndexFromViewport();
            if (liveIdx !== -1) setActiveApiIndex(liveIdx);

            const reachedOrPassed = liveIdx !== -1 && (
                (goingDown && liveIdx >= targetApiIndex) ||
                (!goingDown && liveIdx <= targetApiIndex)
            );

            const bounds = getDomApiIndexBounds(currentDomList);
            const targetOlderThanDomTop = bounds.min !== -1 && targetApiIndex < bounds.min;
            const targetNewerThanDomBottom = bounds.max !== -1 && targetApiIndex > bounds.max;

            const sigNow = getDomProgressSignature(sc);
            staleCount = (sigNow === lastSig) ? (staleCount + 1) : 0;
            lastSig = sigNow;

            if (!goingDown && targetOlderThanDomTop) {
                if (staleCount >= 1) {
                    const changed = await triggerOlderHistoryLoad(sc, step, sigNow, token);
                    await yieldToMainThread();
                    if (token !== jumpTaskSeq) return null;
                    currentDomList = scanDomNodes();
                    target = locateDomElementByApiNode(apiNode);
                    if (target) return target;
                    if (changed) {
                        staleCount = 0;
                        noProgressRounds = 0;
                    } else {
                        noProgressRounds += 1;
                        await sleep(260 + Math.min(1200, noProgressRounds * 140));
                    }
                }
                // 目标仍在 DOM 顶部之外时，持续向上加载，不提前宣告失败。
                continue;
            }

            if (goingDown && targetNewerThanDomBottom) {
                if (rounds % 8 === 0) await sleep(90);
                continue;
            }

            if (!reachedOrPassed && staleCount < 3) {
                if (rounds % 8 === 0) await sleep(90);
                continue;
            }

            const fineStep = Math.max(70, Math.round(step * 0.28));
            const sign = goingDown ? 1 : -1;
            for (let j = 0; j < 7; j += 1) {
                if (token !== jumpTaskSeq) return null;
                scrollByOn(sc, sign * fineStep);
                await sleep(120);
                await yieldToMainThread();
                if (token !== jumpTaskSeq) return null;
                currentDomList = scanDomNodes();
                target = locateDomElementByApiNode(apiNode);
                if (target) return target;
            }

            if (!goingDown) {
                const freshBounds = getDomApiIndexBounds(currentDomList);
                const stillAboveTop = freshBounds.min !== -1 && targetApiIndex < freshBounds.min;
                if (stillAboveTop) continue;
            }
            if (reachedOrPassed && staleCount >= 4) break;
        }
        return null;
    }

    async function jumpToApiNode(apiNode, idx, token = 0) {
        if (!apiNode) return;
        if (token !== jumpTaskSeq) return;
        setStatus(`jump-${idx + 1}`);
        const sc = getScrollContainer();
        const beforeTop = sc === document.scrollingElement || sc === document.documentElement
            ? window.scrollY
            : sc.scrollTop;
        const target = await findTargetWithDirectionalScroll(apiNode, idx, token);
        if (token !== jumpTaskSeq) return;
        if (!target?.element) {
            print(`未定位到目标 DOM 节点\n[${idx + 1}] ${apiNode.sourceMessageId || apiNode.id}\n${shortText(apiNode.text, 200)}`);
            setStatus('jump-miss');
            return;
        }

        const el = target.element;
        const prev = el.style.outline;
        const prevOffset = el.style.outlineOffset;
        el.style.outline = '2px solid #22c55e';
        el.style.outlineOffset = '2px';
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(220);
        if (token !== jumpTaskSeq) return;
        await alignToReadingLine(el);
        if (token !== jumpTaskSeq) return;
        const settle = await settleAtReadingLine(el, 8, token);
        if (token !== jumpTaskSeq) return;
        setTimeout(() => {
            el.style.outline = prev;
            el.style.outlineOffset = prevOffset;
        }, 1200);
        setActiveApiIndex(idx);
        const afterTop = sc === document.scrollingElement || sc === document.documentElement
            ? window.scrollY
            : sc.scrollTop;
        print(`已跳转到节点 [${idx + 1}] rowId=${target.rowId}\n${shortText(target.text, 200)}`);
        if (!settle.ok) {
            setStatus(`jump-partial(${Math.round(settle.delta)})`);
            return;
        }
        if (Math.abs(afterTop - beforeTop) < 4) {
            setStatus('jump-ok-static');
            return;
        }
        setStatus('jump-ok');
    }

    function refreshActiveNodeState() {
        if (activeRefreshPending) return;
        activeRefreshPending = true;
        requestAnimationFrame(() => {
            activeRefreshPending = false;
            if (!apiNodes.length) return;
            const idx = computeActiveApiIndexFromViewport();
            if (idx !== -1) setActiveApiIndex(idx);
        });
    }

    function startActiveRefreshLoop() {
        if (activeRefreshTimer) return;
        activeRefreshTimer = setInterval(() => {
            refreshActiveNodeState();
        }, 900);
    }

    function mountPanel() {
        testPanel = document.createElement('div');
        testPanel.style.cssText = [
            'position:fixed',
            'right:16px',
            'bottom:16px',
            'z-index:2147483647',
            'width:460px',
            'max-height:74vh',
            'background:linear-gradient(160deg,#0b1220,#111827)',
            'color:#dbeafe',
            'border:1px solid rgba(56,189,248,.28)',
            'border-radius:14px',
            'box-shadow:0 18px 45px rgba(2,6,23,.55)',
            'font:12px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
            'display:flex',
            'flex-direction:column'
        ].join(';');

        testPanel.innerHTML = `
            <div style="padding:10px 12px;border-bottom:1px solid rgba(71,85,105,.65);display:flex;justify-content:space-between;align-items:center;">
                <strong>Doubao Nodes Track Test</strong>
                <span id="db-test-status" style="color:#7dd3fc;">idle</span>
            </div>
            <div style="padding:10px 12px;display:flex;gap:8px;flex-wrap:wrap;border-bottom:1px solid rgba(71,85,105,.65);">
                <button id="db-test-api" style="padding:6px 10px;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#e2e8f0;cursor:pointer;">拉取 API 节点</button>
                <button id="db-test-dom" style="padding:6px 10px;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#e2e8f0;cursor:pointer;">扫描 DOM 节点</button>
                <button id="db-test-match" style="padding:6px 10px;border:1px solid #334155;border-radius:8px;background:#0f172a;color:#e2e8f0;cursor:pointer;">匹配报告</button>
            </div>
            <div style="padding:8px 12px;border-bottom:1px solid rgba(71,85,105,.65);display:flex;align-items:center;gap:8px;">
                <span style="color:#93c5fd;">阅读线</span>
                <input id="db-reading-line" type="range" min="25" max="75" step="1" value="${Math.round(readingLineRatio * 100)}" style="flex:1;">
                <span id="db-reading-line-val">${Math.round(readingLineRatio * 100)}%</span>
            </div>
            <pre id="db-test-output" style="margin:0;padding:10px 12px;overflow:auto;white-space:pre-wrap;word-break:break-word;flex:1;"></pre>
        `;

        statusEl = testPanel.querySelector('#db-test-status');
        outputEl = testPanel.querySelector('#db-test-output');

        railWrap = document.createElement('div');
        railWrap.style.cssText = [
            'position:fixed',
            'right:486px',
            'top:90px',
            'bottom:90px',
            'width:62px',
            'z-index:2147483646',
            'background:linear-gradient(180deg,rgba(15,23,42,.88),rgba(2,6,23,.78))',
            'border:1px solid rgba(56,189,248,.28)',
            'border-radius:14px',
            'box-shadow:0 14px 38px rgba(2,6,23,.45)',
            'padding:8px 6px 8px 8px'
        ].join(';');
        railWrap.innerHTML = `<div data-role="rail-content" style="position:relative;height:100%;overflow:auto;padding-right:4px;"></div>`;

        const readingLineInput = testPanel.querySelector('#db-reading-line');
        const readingLineVal = testPanel.querySelector('#db-reading-line-val');
        readingLineInput.addEventListener('input', () => {
            const v = Number(readingLineInput.value || 42);
            readingLineRatio = Math.min(0.75, Math.max(0.25, v / 100));
            readingLineVal.textContent = `${Math.round(readingLineRatio * 100)}%`;
            renderReadingLine();
            refreshActiveNodeState();
        });

        testPanel.querySelector('#db-test-api').addEventListener('click', async () => {
            setStatus('fetch-api');
            try {
                const list = await fetchApiNodes();
                renderRail();
                refreshActiveNodeState();
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

        testPanel.querySelector('#db-test-dom').addEventListener('click', () => {
            setStatus('scan-dom');
            const list = scanDomNodes();
            refreshActiveNodeState();
            print([
                `DOM 用户节点: ${list.length}`,
                '',
                ...list.map((n, i) => `[${i + 1}] rowId=${n.rowId}\n${shortText(n.text, 140)}`)
            ].join('\n'));
            setStatus('dom-ok');
        });

        testPanel.querySelector('#db-test-match').addEventListener('click', async () => {
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

        document.body.appendChild(testPanel);
        document.body.appendChild(railWrap);
        renderReadingLine();
        const sc = getScrollContainer();
        if (sc && sc.addEventListener) sc.addEventListener('scroll', refreshActiveNodeState, { passive: true });
        window.addEventListener('scroll', refreshActiveNodeState, { passive: true });
        const observer = new MutationObserver(() => {
            refreshActiveNodeState();
            scheduleDomDrivenSync();
        });
        observer.observe(document.body, { subtree: true, childList: true, characterData: false, attributes: false });
        startActiveRefreshLoop();
        setTimeout(() => refreshActiveNodeState(), 300);
        setTimeout(() => scheduleDomDrivenSync(), 420);
        print('准备就绪。\n1) 拉取 API 节点\n2) 点击轨道编号点跳转\n3) 调整阅读线观察对齐效果');
    }

    installCaptureHooks();
    if (document.body) mountPanel();
    else document.addEventListener('DOMContentLoaded', mountPanel, { once: true });
})();
