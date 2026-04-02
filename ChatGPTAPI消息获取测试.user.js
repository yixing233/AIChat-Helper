// ==UserScript==
// @name         ChatGPT API 消息获取测试
// @namespace    http://tampermonkey.net/
// @version      0.1.0
// @description  在 ChatGPT 页面直接调用 /backend-api/conversation/{id}，测试更多消息结构的提取与适配
// @author       xchengb
// @match        *://chatgpt.com/*
// @match        *://chat.openai.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const PANEL_ID = 'gpt-api-test-panel';
    const DEFAULT_SAMPLE_LIMIT = 8;

    let capturedWorkspaceIds = new Set();
    let capturedDeviceIds = new Set();
    let capturedFileContentUrls = new Map();
    let capturedFileSimpleUrls = new Map();
    let cachedFileSimpleMeta = new Map();
    let cachedToken = null;
    let cachedAuthorizedFileLinks = new Map();

    function log() {
        console.log('[ChatGPT-API-Test]', ...arguments);
    }

    function safeJsonParse(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function cleanText(text) {
        return String(text || '')
            .replace(/[“"]\s*[“"](?=\s|$)/g, '')
            .replace(/\s{2,}/g, ' ')
            .replace(/\n[ \t]+\n/g, '\n\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function normalizeReferenceName(reference) {
        if (!reference || typeof reference !== 'object') return '';
        return String(
            reference.name ||
            reference.metadata?.name ||
            reference.metadata?.title ||
            reference.title ||
            reference.id ||
            ''
        ).trim();
    }

    function buildReferenceReplacement(reference, fallbackLabel) {
        const type = String(reference?.type || reference?.metadata?.type || '').toLowerCase();
        const name = normalizeReferenceName(reference);
        if (type === 'file' || name) {
            return '[' + (fallbackLabel || '文件引用') + ': ' + (name || '未命名文件') + ']';
        }
        return '[' + (fallbackLabel || '引用') + ']';
    }

    function applyMessageReferences(text, msg) {
        let output = String(text || '');
        const refs = Array.isArray(msg?.metadata?.content_references) ? msg.metadata.content_references : [];
        if (refs.length) {
            const exactItems = refs
                .map((ref, idx) => ({
                    idx,
                    start: Number(ref?.start_idx),
                    end: Number(ref?.end_idx),
                    matchedText: String(ref?.matched_text || ''),
                    replacement: buildReferenceReplacement(ref, ref?.type === 'file' ? '文件引用' : '引用')
                }))
                .filter((item) => item.matchedText || (Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start));

            if (exactItems.length) {
                exactItems.forEach((item) => {
                    if (item.matchedText && output.includes(item.matchedText)) {
                        output = output.split(item.matchedText).join(item.replacement);
                    }
                });

                const fallbackItems = exactItems
                    .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
                    .sort((a, b) => b.start - a.start);

                fallbackItems.forEach((item) => {
                    const segment = output.slice(item.start, item.end);
                    if (segment === item.replacement) return;
                    if (item.matchedText && segment && segment !== item.matchedText && !segment.includes('filecite') && !segment.includes('')) return;
                    output = output.slice(0, item.start) + item.replacement + output.slice(item.end);
                });
                return output;
            }
        }

        const citations = Array.isArray(msg?.metadata?.citations) ? msg.metadata.citations : [];
        if (citations.length) {
            const items = citations
                .map((citation) => ({
                    start: Number(citation?.start_ix),
                    end: Number(citation?.end_ix),
                    replacement: buildReferenceReplacement(
                        citation?.metadata || {},
                        citation?.metadata?.type === 'file' ? '文件引用' : '引用'
                    )
                }))
                .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > item.start)
                .sort((a, b) => b.start - a.start);

            if (items.length) {
                items.forEach((item) => {
                    output = output.slice(0, item.start) + item.replacement + output.slice(item.end);
                });
                return output;
            }
        }

        return output
            .replace(/\uE200filecite(?:\uE202turn\d+file\d+)+\uE201/gi, '[文件引用]')
            .replace(/\uE200cite(?:\uE202turn\d+(?:search|view)\d+)+\uE201/gi, '[引用]')
            .replace(/filecite(?:turn\d+file\d+)+/gi, '[文件引用]')
            .replace(/cite(?:turn\d+(?:search|view)\d+)+/gi, '[引用]');
    }

    function tryCaptureWorkspaceId(name, value) {
        if (!name || value == null || value === '') return;
        const key = String(name).toLowerCase();
        if (key === 'chatgpt-account-id') capturedWorkspaceIds.add(String(value));
        if (key === 'oai-device-id') capturedDeviceIds.add(String(value));
    }

    function tryCaptureFileContentUrl(rawUrl) {
        if (!rawUrl) return;
        try {
            const url = new URL(String(rawUrl), location.origin);
            if (!/\/backend-api\/estuary\/content$/i.test(url.pathname)) return;
            const fileId = String(url.searchParams.get('id') || '').trim();
            if (!fileId) return;
            capturedFileContentUrls.set(fileId, url.toString());
        } catch (e) {
            // ignore
        }
    }

    function tryCaptureFileSimpleUrl(rawUrl) {
        if (!rawUrl) return;
        try {
            const url = new URL(String(rawUrl), location.origin);
            const match = url.pathname.match(/\/backend-api\/files\/([^/]+)\/simple$/i);
            if (!match || !match[1]) return;
            const fileId = decodeURIComponent(match[1]).trim();
            if (!fileId) return;
            capturedFileSimpleUrls.set(fileId, url.toString());
        } catch (e) {
            // ignore
        }
    }

    function captureHeaders(headersLike) {
        if (!headersLike) return;
        if (headersLike instanceof Headers) {
            headersLike.forEach((value, name) => tryCaptureWorkspaceId(name, value));
            return;
        }
        if (Array.isArray(headersLike)) {
            headersLike.forEach((entry) => {
                if (Array.isArray(entry) && entry.length >= 2) tryCaptureWorkspaceId(entry[0], entry[1]);
            });
            return;
        }
        if (typeof headersLike === 'object') {
            Object.entries(headersLike).forEach(([name, value]) => tryCaptureWorkspaceId(name, value));
            return;
        }
        if (typeof headersLike === 'string') {
            tryCaptureWorkspaceId('authorization', headersLike);
        }
    }

    function installCaptureHooks() {
        if (window.__chatgptApiTestHooksInstalled) return;
        window.__chatgptApiTestHooksInstalled = true;

        const rawFetch = window.fetch;
        window.fetch = async function (input, init) {
            try {
                const url = typeof input === 'string' ? input : (input && input.url);
                tryCaptureFileContentUrl(url);
                tryCaptureFileSimpleUrl(url);
                captureHeaders(init && init.headers);
                if (input && typeof input === 'object') captureHeaders(input.headers);
            } catch (e) {
                log('fetch hook error', e);
            }
            return rawFetch.apply(this, arguments);
        };

        const rawOpen = XMLHttpRequest.prototype.open;
        const rawSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

        XMLHttpRequest.prototype.open = function () {
            this.__chatgptApiTestHeaders = {};
            tryCaptureFileContentUrl(arguments[1]);
            tryCaptureFileSimpleUrl(arguments[1]);
            return rawOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
            try {
                if (this.__chatgptApiTestHeaders) this.__chatgptApiTestHeaders[String(name)] = String(value);
                tryCaptureWorkspaceId(name, value);
            } catch (e) {
                log('xhr hook error', e);
            }
            return rawSetRequestHeader.apply(this, arguments);
        };
    }

    function getConversationIdFromUrl() {
        const match = location.pathname.match(/\/c\/([a-z0-9-]+)/i);
        return match ? match[1] : '';
    }

    async function getAccessToken() {
        if (cachedToken) return cachedToken;
        const resp = await fetch('/api/auth/session?unstable_client=true');
        if (!resp.ok) throw new Error('获取 access token 失败: ' + resp.status);
        const json = await resp.json();
        cachedToken = json?.accessToken || null;
        if (!cachedToken) throw new Error('响应中未找到 accessToken');
        return cachedToken;
    }

    function getDeviceId() {
        const captured = Array.from(capturedDeviceIds).find(Boolean);
        if (captured) return String(captured);

        try {
            const cookieMatch = String(document.cookie || '').match(/(?:^|;\s*)oai-did=([^;]+)/i);
            if (cookieMatch && cookieMatch[1]) return decodeURIComponent(cookieMatch[1]);
        } catch (e) {
            // ignore
        }

        try {
            const keys = ['oai-did', 'oai-device-id', 'oaiDeviceId'];
            for (const key of keys) {
                const v1 = localStorage.getItem(key);
                if (v1) return String(v1).replace(/^"|"$/g, '');
                const v2 = sessionStorage.getItem(key);
                if (v2) return String(v2).replace(/^"|"$/g, '');
            }
        } catch (e) {
            // ignore
        }

        return '';
    }

    function detectWorkspaceIds() {
        const found = new Set(capturedWorkspaceIds);

        try {
            const nextDataEl = document.getElementById('__NEXT_DATA__');
            if (nextDataEl && nextDataEl.textContent) {
                const nextData = safeJsonParse(nextDataEl.textContent);
                const accounts = nextData?.props?.pageProps?.user?.accounts;
                if (accounts && typeof accounts === 'object') {
                    Object.values(accounts).forEach((acc) => {
                        const accountId = acc?.account?.id;
                        if (accountId) found.add(String(accountId));
                    });
                }
            }
        } catch (e) {
            // ignore
        }

        try {
            const wsRegex = /\bws-[a-f0-9-]{20,}\b/i;
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i);
                if (!key || !/account|workspace/i.test(key)) continue;
                const value = localStorage.getItem(key);
                if (!value) continue;
                const matched = String(value).match(wsRegex);
                if (matched && matched[0]) found.add(matched[0]);
            }
        } catch (e) {
            // ignore
        }

        return Array.from(found).filter(Boolean);
    }

    function buildHeaders(token, workspaceId) {
        const headers = {
            Authorization: 'Bearer ' + token
        };
        const deviceId = getDeviceId();
        if (deviceId) headers['oai-device-id'] = deviceId;
        if (workspaceId) headers['ChatGPT-Account-Id'] = workspaceId;
        return headers;
    }

    async function fetchConversation(conversationId, workspaceId) {
        const token = await getAccessToken();
        const resp = await fetch('/backend-api/conversation/' + encodeURIComponent(conversationId), {
            headers: buildHeaders(token, workspaceId)
        });
        if (!resp.ok) {
            throw new Error('获取会话详情失败 (' + resp.status + ')');
        }
        return resp.json();
    }

    async function fetchSimpleFileMeta(fileId, conversationId, workspaceId) {
        const id = String(fileId || '').trim();
        const convId = String(conversationId || '').trim();
        if (!id || !convId) return null;

        const cacheKey = id + '::' + convId + '::' + String(workspaceId || '');
        if (cachedFileSimpleMeta.has(cacheKey)) return cachedFileSimpleMeta.get(cacheKey);

        const token = await getAccessToken();
        const url = '/backend-api/files/' + encodeURIComponent(id) + '/simple?conversation_id=' + encodeURIComponent(convId);
        capturedFileSimpleUrls.set(id, new URL(url, location.origin).toString());

        const resp = await fetch(url, {
            headers: buildHeaders(token, workspaceId)
        });
        if (!resp.ok) {
            throw new Error('获取文件 simple 信息失败 (' + resp.status + ')');
        }

        const contentType = String(resp.headers.get('content-type') || '').toLowerCase();
        let data = null;
        if (contentType.includes('application/json')) {
            data = await resp.json();
        } else {
            const text = await resp.text();
            data = safeJsonParse(text) || { rawText: text };
        }

        cachedFileSimpleMeta.set(cacheKey, data);
        return data;
    }

    async function buildAuthorizedFileAccessLink(fileId, conversationId, workspaceId) {
        const id = String(fileId || '').trim();
        const convId = String(conversationId || '').trim();
        if (!id || !convId) return '';

        const cacheKey = id + '::' + convId + '::' + String(workspaceId || '');
        if (cachedAuthorizedFileLinks.has(cacheKey)) return cachedAuthorizedFileLinks.get(cacheKey);

        const token = await getAccessToken();
        const url = '/backend-api/files/' + encodeURIComponent(id) + '/simple?conversation_id=' + encodeURIComponent(convId);
        const resp = await fetch(url, {
            headers: buildHeaders(token, workspaceId)
        });
        if (!resp.ok) {
            const text = await resp.text().catch(() => '');
            throw new Error('获取文件访问内容失败 (' + resp.status + ')' + (text ? ': ' + truncate(text, 160) : ''));
        }

        const blob = await resp.blob();
        const blobUrl = URL.createObjectURL(blob);
        cachedAuthorizedFileLinks.set(cacheKey, blobUrl);
        return blobUrl;
    }

    async function enrichFileReferences(fileReferences, conversationId, workspaceId) {
        const rows = Array.isArray(fileReferences) ? fileReferences : [];
        await Promise.all(rows.map(async (row) => {
            const fileId = String(row?.fileId || '').trim();
            if (!fileId) return;

            row.simpleUrl = capturedFileSimpleUrls.get(fileId) || (
                conversationId
                    ? new URL('/backend-api/files/' + encodeURIComponent(fileId) + '/simple?conversation_id=' + encodeURIComponent(conversationId), location.origin).toString()
                    : ''
            );

            try {
                const meta = await fetchSimpleFileMeta(fileId, conversationId, workspaceId);
                row.simpleMeta = meta;

                const candidateUrl = String(
                    meta?.download_url ||
                    meta?.url ||
                    meta?.href ||
                    meta?.presigned_url ||
                    meta?.signed_url ||
                    meta?.file_url ||
                    meta?.content_url ||
                    ''
                ).trim();

                if (candidateUrl) {
                    row.url = candidateUrl;
                } else if (!row.url && capturedFileContentUrls.get(fileId)) {
                    row.url = capturedFileContentUrls.get(fileId) || '';
                }

                const candidateName = String(
                    meta?.name ||
                    meta?.filename ||
                    meta?.file_name ||
                    ''
                ).trim();
                if (candidateName) row.name = candidateName;

                try {
                    row.authorizedUrl = await buildAuthorizedFileAccessLink(fileId, conversationId, workspaceId);
                } catch (e) {
                    row.authorizedError = e && e.message ? e.message : String(e);
                }
            } catch (e) {
                row.simpleError = e && e.message ? e.message : String(e);
                if (!row.url) row.url = capturedFileContentUrls.get(fileId) || '';
            }
        }));
        return rows;
    }

    function isPlainObject(value) {
        return Object.prototype.toString.call(value) === '[object Object]';
    }

    function truncate(text, len) {
        const raw = String(text == null ? '' : text);
        return raw.length > len ? raw.slice(0, len) + '...' : raw;
    }

    function buildCodeFence(lang, code) {
        const language = String(lang || '').trim();
        const body = String(code || '').trim();
        if (!body) return '';
        return '```' + language + '\n' + body + '\n```';
    }

    function baseExtractMessageText(msg) {
        const content = msg?.content;
        if (!content) return '';
        if (typeof content === 'string') return cleanText(applyMessageReferences(content, msg));

        const walk = (part) => {
            if (part == null) return '';
            if (typeof part === 'string') return part;
            if (Array.isArray(part)) return part.map(walk).filter(Boolean).join('\n');
            if (typeof part !== 'object') return String(part);

            const partType = part.content_type || part.type || '';
            const lang = (part.language || part.lang || '').trim();
            const rawText = typeof part.text === 'string'
                ? part.text
                : (typeof part.content === 'string' ? part.content : '');

            if (partType === 'code' || partType === 'program' || (lang && rawText)) {
                return buildCodeFence(lang, rawText);
            }
            if (partType === 'image' || partType === 'image_asset_pointer') {
                return '[图片内容已省略]';
            }

            const nested = [
                part.parts,
                part.items,
                part.content,
                part.output,
                part.result,
                part.children,
                part.data
            ].map(walk).filter(Boolean).join('\n').trim();

            if (rawText && nested) return rawText + '\n' + nested;
            return rawText || nested || '';
        };

        let raw = '';
        if (Array.isArray(content.parts) && content.parts.length) raw = walk(content.parts);
        else if (typeof content.text === 'string') raw = content.text;
        else if (Array.isArray(content.items) && content.items.length) raw = walk(content.items);
        else if (content.output) raw = walk(content.output);
        else if (content.result) raw = walk(content.result);
        else if (content.content) raw = walk(content.content);
        else raw = walk(content);

        return cleanText(applyMessageReferences(raw, msg));
    }

    function enhancedExtractMessageText(msg) {
        const content = msg?.content;
        if (!content) return '';

        const seen = new WeakSet();
        const textKeys = [
            'text', 'content', 'body', 'value', 'caption', 'alt', 'display_text', 'title',
            'description', 'prompt', 'question', 'answer', 'transcript', 'final_text',
            'summary', 'label', 'snippet'
        ];

        const walk = (value, depth) => {
            if (value == null || depth > 8) return '';
            if (typeof value === 'string') return cleanText(value);
            if (typeof value === 'number' || typeof value === 'boolean') return String(value);
            if (Array.isArray(value)) {
                return cleanText(value.map((item) => walk(item, depth + 1)).filter(Boolean).join('\n'));
            }
            if (!isPlainObject(value)) return '';
            if (seen.has(value)) return '';
            seen.add(value);

            const type = String(value.content_type || value.type || value.mime_type || '').toLowerCase();
            const lang = String(value.language || value.lang || value.syntax || '').trim();

            if (type.includes('image')) {
                const desc = walk(value.alt || value.caption || value.description, depth + 1);
                return desc ? '[图片] ' + desc : '[图片内容已省略]';
            }

            if (type.includes('audio')) {
                const transcript = walk(value.transcript || value.text || value.content, depth + 1);
                return transcript ? '[音频转写]\n' + transcript : '[音频内容已省略]';
            }

            if (type.includes('file') || type.includes('attachment')) {
                const name = walk(value.name || value.filename || value.file_name, depth + 1);
                return name ? '[附件] ' + name : '[附件内容已省略]';
            }

            const directTexts = [];
            textKeys.forEach((key) => {
                const raw = value[key];
                if (typeof raw === 'string') {
                    const cleaned = cleanText(raw);
                    if (cleaned) directTexts.push(cleaned);
                }
            });

            const code = typeof value.code === 'string' ? value.code : '';
            if (code) directTexts.push(buildCodeFence(lang || value.language, code));

            const structuredKeys = [
                'parts', 'items', 'content', 'output', 'result', 'children', 'data',
                'message', 'messages', 'asset_pointer', 'caption_segments', 'annotations',
                'metadata', 'source', 'sources', 'blocks', 'segments'
            ];
            const nestedTexts = structuredKeys
                .map((key) => walk(value[key], depth + 1))
                .filter(Boolean);

            if (!directTexts.length && !nestedTexts.length) {
                Object.entries(value).forEach(([key, raw]) => {
                    if (/id|index|status|role|author|recipient|create_time|update_time|model_slug/i.test(key)) return;
                    const text = walk(raw, depth + 1);
                    if (text) nestedTexts.push(text);
                });
            }

            return cleanText([].concat(directTexts, nestedTexts).filter(Boolean).join('\n'));
        };

        return cleanText(applyMessageReferences(walk(content, 0), msg));
    }

    function summarizeContent(content) {
        if (content == null) return 'null';
        if (typeof content === 'string') return 'string';
        if (Array.isArray(content)) return 'array(' + content.length + ')';
        if (!isPlainObject(content)) return typeof content;

        const type = content.content_type || content.type || 'object';
        const keys = Object.keys(content).slice(0, 12).join(', ');
        return String(type) + ' [' + keys + ']';
    }

    function collectNodeStats(convData) {
        const mapping = convData?.mapping || {};
        const rows = [];
        Object.entries(mapping).forEach(([nodeId, node]) => {
            const msg = node?.message;
            if (!msg) return;
            const role = msg.author?.role || '';
            rows.push({
                nodeId,
                parent: node?.parent || '',
                children: Array.isArray(node?.children) ? node.children.length : 0,
                role,
                hidden: Boolean(
                    msg.metadata?.is_visually_hidden_from_conversation ||
                    msg.metadata?.is_contextual_answers_system_message
                ),
                contentType: String(msg.content?.content_type || msg.content?.type || typeof msg.content),
                summary: summarizeContent(msg.content),
                baseText: baseExtractMessageText(msg),
                enhancedText: enhancedExtractMessageText(msg),
                rawContent: msg.content
            });
        });
        return rows;
    }

    function extractActivePathIds(convData) {
        const mapping = convData?.mapping || {};
        const currentNodeId = convData?.current_node;
        if (!currentNodeId || !mapping[currentNodeId]) return [];

        const path = [];
        const visited = new Set();
        let cursor = currentNodeId;
        while (cursor && mapping[cursor] && !visited.has(cursor)) {
            visited.add(cursor);
            path.unshift(cursor);
            cursor = mapping[cursor]?.parent;
        }
        return path;
    }

    function extractMessages(convData, extractor) {
        const mapping = convData?.mapping || {};
        const activePath = extractActivePathIds(convData);
        const useActivePath = activePath.length > 0;
        const nodeIds = useActivePath ? activePath : Object.keys(mapping);
        const out = [];

        nodeIds.forEach((nodeId) => {
            const node = mapping[nodeId];
            const msg = node?.message;
            if (!msg) return;
            const role = msg.author?.role;
            const hidden = msg.metadata?.is_visually_hidden_from_conversation ||
                msg.metadata?.is_contextual_answers_system_message;
            if ((role !== 'user' && role !== 'assistant') || hidden) return;

            const text = cleanText(extractor(msg));
            if (!text) return;

            out.push({
                nodeId,
                role,
                createTime: msg.create_time || 0,
                text
            });
        });

        out.sort((a, b) => (a.createTime || 0) - (b.createTime || 0));
        out.forEach((item) => delete item.createTime);
        return out;
    }

    function buildReport(convData, workspaceId) {
        const nodeStats = collectNodeStats(convData);
        const activePathIds = extractActivePathIds(convData);
        const baseMessages = extractMessages(convData, baseExtractMessageText);
        const enhancedMessages = extractMessages(convData, enhancedExtractMessageText);

        const roleStats = {};
        const contentTypeStats = {};
        nodeStats.forEach((row) => {
            const roleKey = row.role || 'unknown';
            const typeKey = row.contentType || 'unknown';
            roleStats[roleKey] = (roleStats[roleKey] || 0) + 1;
            contentTypeStats[typeKey] = (contentTypeStats[typeKey] || 0) + 1;
        });

        const suspiciousRows = nodeStats.filter((row) => {
            if (row.hidden) return false;
            if (row.role !== 'user' && row.role !== 'assistant') return false;
            return !row.baseText && !!row.enhancedText;
        });

        const emptyRows = nodeStats.filter((row) => {
            if (row.hidden) return false;
            if (row.role !== 'user' && row.role !== 'assistant') return false;
            return !row.baseText && !row.enhancedText;
        });

        const fileReferences = [];
        const seenFiles = new Set();
        Object.values(convData?.mapping || {}).forEach((node) => {
            const refs = Array.isArray(node?.message?.metadata?.content_references) ? node.message.metadata.content_references : [];
            refs.forEach((ref) => {
                const fileId = String(ref?.id || '').trim();
                const name = normalizeReferenceName(ref);
                const key = fileId || name;
                if (!key || seenFiles.has(key)) return;
                seenFiles.add(key);
                fileReferences.push({
                    fileId,
                    name: name || '(未命名文件)',
                    url: fileId ? (capturedFileContentUrls.get(fileId) || '') : ''
                });
            });
        });

        return {
            conversationId: String(convData?.conversation_id || ''),
            title: String(convData?.title || ''),
            workspaceId: String(workspaceId || ''),
            currentNode: String(convData?.current_node || ''),
            mappingCount: Object.keys(convData?.mapping || {}).length,
            activePathCount: activePathIds.length,
            roleStats,
            contentTypeStats,
            baseMessages,
            enhancedMessages,
            suspiciousRows,
            emptyRows,
            sampleRows: suspiciousRows.concat(emptyRows).slice(0, DEFAULT_SAMPLE_LIMIT),
            fileReferences,
            raw: convData
        };
    }

    function formatStatsMap(map) {
        const entries = Object.entries(map || {}).sort((a, b) => b[1] - a[1]);
        if (!entries.length) return '-';
        return entries.map(([key, value]) => key + ': ' + value).join('\n');
    }

    function formatMessages(messages) {
        if (!Array.isArray(messages) || !messages.length) return '(无)';
        return messages.map((msg, idx) => {
            return '[' + (idx + 1) + '] ' + (msg.role === 'user' ? '用户' : '助手') + ' #' + msg.nodeId + '\n' + msg.text;
        }).join('\n\n');
    }

    function formatSampleRows(rows) {
        if (!rows.length) return '(无)';
        return rows.map((row, idx) => {
            return [
                '样本 ' + (idx + 1),
                'nodeId: ' + row.nodeId,
                'role: ' + row.role,
                'contentType: ' + row.contentType,
                'summary: ' + row.summary,
                'base: ' + (row.baseText ? truncate(row.baseText, 180) : '(空)'),
                'enhanced: ' + (row.enhancedText ? truncate(row.enhancedText, 180) : '(空)'),
                'raw: ' + JSON.stringify(row.rawContent, null, 2)
            ].join('\n');
        }).join('\n\n----------------------------------------\n\n');
    }

    function formatFileReferences(rows) {
        if (!Array.isArray(rows) || !rows.length) return '(无)';
        return rows.map((row, idx) => {
            return [
                '[' + (idx + 1) + '] ' + row.name,
                'file_id: ' + (row.fileId || '-'),
                'simple_url: ' + (row.simpleUrl || '(未生成)'),
                'authorized_url: ' + (row.authorizedUrl || '(尚未生成已授权访问链接)'),
                'url: ' + (row.url || '(尚未捕获可下载链接)'),
                row.simpleError ? ('simple_error: ' + row.simpleError) : '',
                row.authorizedError ? ('authorized_error: ' + row.authorizedError) : ''
            ].join('\n');
        }).join('\n\n');
    }

    function downloadText(filename, text) {
        const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    function downloadJson(filename, data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    function ensurePanel() {
        let panel = document.getElementById(PANEL_ID);
        if (panel) return panel;

        GM_addStyle(`
            #${PANEL_ID}{
                position:fixed;right:16px;bottom:16px;z-index:2147483647;width:440px;
                background:#ffffff;border:1px solid #d0d7de;border-radius:14px;
                box-shadow:0 14px 40px rgba(15,23,42,.18);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
                color:#0f172a;overflow:hidden;
            }
            #${PANEL_ID} .gpt-api-test-head{
                display:flex;align-items:center;justify-content:space-between;padding:12px 14px;
                background:linear-gradient(135deg,#10a37f,#0f766e);color:#fff;font-size:14px;font-weight:700;
            }
            #${PANEL_ID} .gpt-api-test-body{padding:12px 14px;}
            #${PANEL_ID} .gpt-api-test-row{margin-bottom:10px;}
            #${PANEL_ID} label{display:block;font-size:12px;font-weight:600;margin-bottom:4px;color:#334155;}
            #${PANEL_ID} input,#${PANEL_ID} select,#${PANEL_ID} textarea{
                width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;
                padding:8px 10px;font-size:12px;background:#fff;color:#0f172a;
            }
            #${PANEL_ID} textarea{min-height:100px;resize:vertical;font-family:Consolas,"Courier New",monospace;}
            #${PANEL_ID} .gpt-api-test-btns{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;}
            #${PANEL_ID} button{
                border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;
            }
            #${PANEL_ID} button.primary{background:#0f766e;color:#fff;}
            #${PANEL_ID} button.secondary{background:#e2e8f0;color:#0f172a;}
            #${PANEL_ID} .gpt-api-test-result{
                margin-top:12px;border:1px solid #e2e8f0;border-radius:10px;background:#f8fafc;
                padding:10px;font-size:12px;line-height:1.5;max-height:340px;overflow:auto;white-space:pre-wrap;
                font-family:Consolas,"Courier New",monospace;
            }
            #${PANEL_ID} .gpt-api-test-meta{font-size:11px;color:#475569;margin-top:6px;line-height:1.5;}
        `);

        panel = document.createElement('div');
        panel.id = PANEL_ID;
        panel.innerHTML = `
            <div class="gpt-api-test-head">
                <span>ChatGPT API 消息测试</span>
                <button id="gpt-api-test-close" class="secondary" style="padding:4px 8px;">收起</button>
            </div>
            <div class="gpt-api-test-body">
                <div class="gpt-api-test-row">
                    <label for="gpt-api-test-conv">会话 ID</label>
                    <input id="gpt-api-test-conv" placeholder="自动从当前 URL 获取">
                </div>
                <div class="gpt-api-test-row">
                    <label for="gpt-api-test-workspace">Workspace ID</label>
                    <select id="gpt-api-test-workspace"></select>
                </div>
                <div class="gpt-api-test-btns">
                    <button id="gpt-api-test-run" class="primary">抓取并分析</button>
                    <button id="gpt-api-test-download-report" class="secondary">下载报告</button>
                    <button id="gpt-api-test-download-json" class="secondary">下载原始 JSON</button>
                    <button id="gpt-api-test-refresh" class="secondary">刷新空间</button>
                </div>
                <div class="gpt-api-test-meta" id="gpt-api-test-meta">等待执行</div>
                <div class="gpt-api-test-result" id="gpt-api-test-result">点击“抓取并分析”开始。</div>
            </div>
        `;
        document.body.appendChild(panel);

        const convInput = panel.querySelector('#gpt-api-test-conv');
        const workspaceSelect = panel.querySelector('#gpt-api-test-workspace');
        const metaEl = panel.querySelector('#gpt-api-test-meta');
        const resultEl = panel.querySelector('#gpt-api-test-result');

        convInput.value = getConversationIdFromUrl();

        let lastReport = null;

        function refreshWorkspaceOptions() {
            const current = workspaceSelect.value;
            const list = detectWorkspaceIds();
            const options = ['<option value="">个人空间 / 默认</option>']
                .concat(list.map((id) => '<option value="' + escapeHtml(id) + '">' + escapeHtml(id) + '</option>'));
            workspaceSelect.innerHTML = options.join('');
            if (list.includes(current)) workspaceSelect.value = current;
        }

        async function runAnalysis() {
            const conversationId = String(convInput.value || '').trim() || getConversationIdFromUrl();
            const workspaceId = String(workspaceSelect.value || '').trim();
            if (!conversationId) {
                resultEl.textContent = '未识别到会话 ID，请先打开具体对话页面，例如 /c/{conversation_id}。';
                return;
            }

            convInput.value = conversationId;
            resultEl.textContent = '正在请求 ChatGPT 会话接口...';
            metaEl.textContent = '请求中';

            try {
                const convData = await fetchConversation(conversationId, workspaceId);
                const report = buildReport(convData, workspaceId);
                await enrichFileReferences(report.fileReferences, report.conversationId || conversationId, workspaceId);
                lastReport = report;

                const lines = [
                    '标题: ' + (report.title || '(无标题)'),
                    '会话ID: ' + (report.conversationId || conversationId),
                    'Workspace: ' + (report.workspaceId || '(默认)'),
                    'current_node: ' + (report.currentNode || '-'),
                    'mapping 节点数: ' + report.mappingCount,
                    'active path 节点数: ' + report.activePathCount,
                    '',
                    '角色统计',
                    formatStatsMap(report.roleStats),
                    '',
                    'content_type 统计',
                    formatStatsMap(report.contentTypeStats),
                    '',
                    '基础提取消息数: ' + report.baseMessages.length,
                    '扩展提取消息数: ' + report.enhancedMessages.length,
                    '基础为空但扩展有内容: ' + report.suspiciousRows.length,
                    '两者都为空: ' + report.emptyRows.length,
                    '',
                    '文件引用',
                    formatFileReferences(report.fileReferences),
                    '',
                    '扩展提取结果',
                    formatMessages(report.enhancedMessages),
                    '',
                    '待适配样本',
                    formatSampleRows(report.sampleRows)
                ];

                metaEl.textContent = '完成: ' + new Date().toLocaleString();
                resultEl.textContent = lines.join('\n');
            } catch (e) {
                metaEl.textContent = '失败';
                resultEl.textContent = '请求失败: ' + (e && e.message ? e.message : String(e));
            }
        }

        panel.querySelector('#gpt-api-test-run').addEventListener('click', runAnalysis);
        panel.querySelector('#gpt-api-test-refresh').addEventListener('click', refreshWorkspaceOptions);
        panel.querySelector('#gpt-api-test-download-report').addEventListener('click', () => {
            if (!lastReport) {
                resultEl.textContent = '还没有可下载的报告，请先执行抓取。';
                return;
            }
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            downloadText('ChatGPT_消息测试报告_' + stamp + '.txt', resultEl.textContent);
        });
        panel.querySelector('#gpt-api-test-download-json').addEventListener('click', () => {
            if (!lastReport) {
                resultEl.textContent = '还没有可下载的原始数据，请先执行抓取。';
                return;
            }
            const stamp = new Date().toISOString().replace(/[:.]/g, '-');
            downloadJson('ChatGPT_原始会话_' + stamp + '.json', lastReport.raw);
        });
        panel.querySelector('#gpt-api-test-close').addEventListener('click', () => {
            const body = panel.querySelector('.gpt-api-test-body');
            const hidden = body.style.display === 'none';
            body.style.display = hidden ? '' : 'none';
            panel.querySelector('#gpt-api-test-close').textContent = hidden ? '收起' : '展开';
        });

        refreshWorkspaceOptions();
        return panel;
    }

    function bootstrap() {
        installCaptureHooks();
        ensurePanel();
        log('已加载 ChatGPT API 消息获取测试脚本');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
    } else {
        bootstrap();
    }
})();
