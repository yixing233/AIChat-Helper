// ==UserScript==
// @name         ChatGPT Export Raw Test
// @namespace    https://github.com/yixing233/AIChat-Helper
// @version      0.2.0
// @description  Dump ChatGPT conversation API and DOM raw data for export debugging.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const LOG_PREFIX = '[ChatGPT Export Raw Test]';

    function getConversationIdFromUrl() {
        const m = location.pathname.match(/\/c\/([a-z0-9-]+)/i);
        return m ? m[1] : '';
    }

    function getChatGPTDeviceId() {
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

    function detectChatGPTWorkspaceIds() {
        const found = new Set();

        try {
            const nextDataEl = document.getElementById('__NEXT_DATA__');
            if (nextDataEl?.textContent) {
                const nextData = JSON.parse(nextDataEl.textContent);
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
            const wsRegex = /\bws-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/i;
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = localStorage.key(i);
                if (!key || (!/account|workspace/i.test(key))) continue;
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

    function buildChatGPTApiHeaders(token, workspaceId = '') {
        const headers = {
            accept: 'application/json'
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        const deviceId = getChatGPTDeviceId();
        if (deviceId) headers['oai-device-id'] = deviceId;
        if (workspaceId) headers['ChatGPT-Account-Id'] = workspaceId;
        return headers;
    }

    function safeJson(value) {
        try {
            return JSON.parse(JSON.stringify(value));
        } catch (e) {
            return {
                __string: String(value),
                __error: e?.message || String(e)
            };
        }
    }

    function summarizeContent(content) {
        if (content == null) return { kind: 'empty' };
        if (typeof content === 'string') {
            return {
                kind: 'string',
                length: content.length,
                preview: content.slice(0, 500)
            };
        }
        if (typeof content !== 'object') {
            return {
                kind: typeof content,
                value: String(content)
            };
        }
        const parts = Array.isArray(content.parts) ? content.parts : null;
        return {
            kind: 'object',
            content_type: content.content_type || content.type || '',
            keys: Object.keys(content),
            partsLength: parts ? parts.length : 0,
            partsSummary: parts ? parts.map((part, idx) => ({
                idx,
                type: part?.type || part?.content_type || typeof part,
                recipient: part?.recipient || '',
                language: part?.language || part?.lang || '',
                textLength: typeof part?.text === 'string' ? part.text.length : 0,
                textPreview: typeof part?.text === 'string' ? part.text.slice(0, 500) : '',
                keys: part && typeof part === 'object' ? Object.keys(part) : []
            })) : []
        };
    }

    function partToRawMarkdown(part) {
        if (part == null) return '';
        if (typeof part === 'string') return part;
        if (Array.isArray(part)) return part.map(partToRawMarkdown).filter(Boolean).join('\n');
        if (typeof part !== 'object') return String(part);

        const lang = String(part.language || part.lang || '').trim();
        const rawText = typeof part.text === 'string'
            ? part.text
            : (typeof part.content === 'string' ? part.content : '');
        if (lang && rawText) return `\n\`\`\`${lang}\n${rawText}\n\`\`\`\n`;

        const nested = [
            part.parts,
            part.items,
            part.content,
            part.output,
            part.result,
            part.children,
            part.data
        ].map(partToRawMarkdown).filter(Boolean).join('\n').trim();

        if (rawText && nested) return `${rawText}\n${nested}`;
        return rawText || nested || '';
    }

    function extractRawMessageText(message) {
        const content = message?.content;
        if (!content) return '';
        if (typeof content === 'string') return content;
        if (Array.isArray(content.parts) && content.parts.length) return partToRawMarkdown(content.parts);
        if (typeof content.text === 'string') return content.text;
        if (Array.isArray(content.items) && content.items.length) return partToRawMarkdown(content.items);
        if (content.output) return partToRawMarkdown(content.output);
        if (content.result) return partToRawMarkdown(content.result);
        if (content.content) return partToRawMarkdown(content.content);
        return partToRawMarkdown(content);
    }

    function buildApiMessages(conversationJson) {
        const mapping = conversationJson?.mapping || {};
        const currentNodeId = conversationJson?.current_node || '';
        const out = [];
        const pushNode = (nodeId) => {
            const node = mapping[nodeId];
            const msg = node?.message;
            if (!msg) return;
            const role = msg.author?.role || '';
            if (role !== 'user' && role !== 'assistant') return;
            if (msg.metadata?.is_visually_hidden_from_conversation || msg.metadata?.is_contextual_answers_system_message) return;
            out.push({
                nodeId,
                role,
                createTime: msg.create_time || 0,
                status: msg.status || '',
                contentSummary: summarizeContent(msg.content),
                rawExtractedText: extractRawMessageText(msg),
                rawMessage: safeJson(msg)
            });
        };

        if (currentNodeId && mapping[currentNodeId]) {
            const path = [];
            const guard = new Set();
            let cursor = currentNodeId;
            while (cursor && mapping[cursor] && !guard.has(cursor)) {
                guard.add(cursor);
                path.unshift(cursor);
                cursor = mapping[cursor]?.parent;
            }
            path.forEach(pushNode);
        } else {
            Object.keys(mapping)
                .sort((a, b) => (mapping[a]?.message?.create_time || 0) - (mapping[b]?.message?.create_time || 0))
                .forEach(pushNode);
        }
        return out;
    }

    function collectDomMessages() {
        const turns = Array.from(document.querySelectorAll('article, section[data-turn], [data-message-author-role]'));
        return turns.map((turn, idx) => {
            const directRole = turn.getAttribute('data-turn') || turn.getAttribute('data-message-author-role') || '';
            const nestedRole = turn.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role') || '';
            const role = directRole || nestedRole || 'unknown';
            const markdownEl = turn.querySelector('.markdown');
            const userEl = turn.querySelector('.whitespace-pre-wrap');
            return {
                idx,
                role,
                tag: turn.tagName,
                id: turn.id || '',
                classes: turn.className || '',
                innerText: turn.innerText || '',
                markdownInnerText: markdownEl?.innerText || '',
                markdownInnerHTML: markdownEl?.innerHTML || '',
                userInnerText: userEl?.innerText || '',
                htmlPreview: String(turn.innerHTML || '').slice(0, 5000)
            };
        }).filter((item) => String(item.innerText || item.markdownInnerText || item.userInnerText).trim());
    }

    async function getSessionDebug() {
        try {
            const resp = await fetch('/api/auth/session?unstable_client=true', {
                credentials: 'include'
            });
            const json = await resp.json().catch(() => null);
            return {
                ok: resp.ok,
                status: resp.status,
                hasAccessToken: Boolean(json?.accessToken),
                accessToken: json?.accessToken || '',
                accessTokenLength: json?.accessToken ? String(json.accessToken).length : 0,
                user: json?.user ? safeJson(json.user) : null,
                expires: json?.expires || ''
            };
        } catch (e) {
            return {
                ok: false,
                error: e?.message || String(e)
            };
        }
    }

    async function fetchConversationRaw(conversationId, token = '', workspaceId = '') {
        const resp = await fetch(`/backend-api/conversation/${conversationId}`, {
            credentials: 'include',
            headers: buildChatGPTApiHeaders(token, workspaceId)
        });
        const text = await resp.text();
        let json = null;
        try {
            json = JSON.parse(text);
        } catch (e) {
            json = null;
        }
        return {
            ok: resp.ok,
            status: resp.status,
            statusText: resp.statusText,
            url: resp.url,
            workspaceId,
            hasAuthorization: Boolean(token),
            hasDeviceId: Boolean(getChatGPTDeviceId()),
            textLength: text.length,
            textPreview: text.slice(0, 2000),
            json
        };
    }

    async function fetchConversationApiVariants(conversationId, session) {
        const token = session?.accessToken || '';
        const workspaceIds = detectChatGPTWorkspaceIds();
        const variants = [
            { label: 'personal-with-token', workspaceId: '', token },
            ...workspaceIds.map((workspaceId) => ({ label: `workspace-with-token:${workspaceId}`, workspaceId, token })),
            { label: 'personal-cookie-only', workspaceId: '', token: '' }
        ];
        const out = [];
        for (const variant of variants) {
            const result = await fetchConversationRaw(conversationId, variant.token, variant.workspaceId);
            out.push({
                label: variant.label,
                workspaceId: variant.workspaceId,
                ok: result.ok,
                status: result.status,
                statusText: result.statusText,
                textLength: result.textLength,
                textPreview: result.textPreview,
                hasJson: Boolean(result.json),
                hasMapping: Boolean(result.json?.mapping),
                mappingNodes: result.json?.mapping ? Object.keys(result.json.mapping).length : 0,
                messageCount: result.json ? buildApiMessages(result.json).length : 0,
                raw: result
            });
            if (result.ok && result.json?.mapping) break;
        }
        return {
            workspaceIds,
            variants: out,
            winner: out.find((item) => item.ok && item.hasMapping) || null
        };
    }

    function downloadJson(data) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `chatgpt-export-raw-debug-${stamp}.json`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(a.href);
            a.remove();
        }, 1000);
    }

    function showStatus(text, isError) {
        let el = document.getElementById('chatgpt-export-raw-test-status');
        if (!el) {
            el = document.createElement('div');
            el.id = 'chatgpt-export-raw-test-status';
            el.style.cssText = 'position:fixed;right:16px;bottom:70px;z-index:2147483647;max-width:360px;padding:10px 12px;border-radius:10px;background:#111827;color:#fff;font-size:12px;line-height:1.45;box-shadow:0 8px 24px rgba(0,0,0,.18);';
            document.body.appendChild(el);
        }
        el.textContent = text;
        el.style.background = isError ? '#991b1b' : '#111827';
        clearTimeout(el.__timer);
        el.__timer = setTimeout(() => el.remove(), isError ? 8000 : 3500);
    }

    async function runDump() {
        const conversationId = getConversationIdFromUrl();
        if (!conversationId) {
            showStatus('当前 URL 未发现 /c/{conversationId}', true);
            return;
        }
        showStatus('正在抓取 ChatGPT 原始响应...');
        const session = await getSessionDebug();
        const sessionPublic = { ...session };
        if (sessionPublic.accessToken) sessionPublic.accessToken = '[redacted]';
        const apiVariants = await fetchConversationApiVariants(conversationId, session);
        const api = apiVariants.winner?.raw || apiVariants.variants[0]?.raw || null;
        const apiMessages = api?.json ? buildApiMessages(api.json) : [];
        const domMessages = collectDomMessages();
        const debug = {
            generatedAt: new Date().toISOString(),
            page: {
                href: location.href,
                title: document.title,
                conversationId,
                userAgent: navigator.userAgent
            },
            session: sessionPublic,
            api: {
                note: 'API is primary. DOM below is only diagnostic comparison.',
                selectedVariant: apiVariants.winner?.label || '',
                variants: apiVariants.variants.map((item) => ({
                    label: item.label,
                    workspaceId: item.workspaceId,
                    ok: item.ok,
                    status: item.status,
                    statusText: item.statusText,
                    textLength: item.textLength,
                    textPreview: item.textPreview,
                    hasJson: item.hasJson,
                    hasMapping: item.hasMapping,
                    mappingNodes: item.mappingNodes,
                    messageCount: item.messageCount
                })),
                detectedWorkspaceIds: apiVariants.workspaceIds,
                ok: Boolean(api?.ok),
                status: api?.status || 0,
                statusText: api?.statusText || '',
                url: api?.url || '',
                workspaceId: api?.workspaceId || '',
                hasAuthorization: Boolean(api?.hasAuthorization),
                hasDeviceId: Boolean(api?.hasDeviceId),
                textLength: api?.textLength || 0,
                textPreview: api?.textPreview || '',
                rawJson: api?.json || null
            },
            apiMessages,
            domDiagnosticOnly: domMessages,
            counts: {
                apiMessages: apiMessages.length,
                domDiagnosticOnly: domMessages.length,
                mappingNodes: api?.json?.mapping ? Object.keys(api.json.mapping).length : 0
            }
        };
        console.log(LOG_PREFIX, debug);
        downloadJson(debug);
        showStatus(`已下载调试 JSON：API ${apiMessages.length} 条，DOM 对照 ${domMessages.length} 条，来源 ${apiVariants.winner?.label || 'API 失败'}`);
    }

    function mountButton() {
        if (document.getElementById('chatgpt-export-raw-test-btn')) return;
        const btn = document.createElement('button');
        btn.id = 'chatgpt-export-raw-test-btn';
        btn.textContent = '导出原始响应';
        btn.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:10px 14px;border:1px solid #2563eb;border-radius:999px;background:#2563eb;color:#fff;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 8px 24px rgba(37,99,235,.25);';
        btn.addEventListener('click', () => {
            runDump().catch((e) => {
                console.error(LOG_PREFIX, e);
                showStatus(`抓取失败：${e?.message || String(e)}`, true);
            });
        });
        document.body.appendChild(btn);
    }

    mountButton();
    setInterval(mountButton, 2000);
})();
