// ==UserScript==
// @name         Claude Nodes Test
// @namespace    https://example.com/
// @version      0.1.0
// @description  仅用于测试 Claude 节点信息：API 获取用户节点 + DOM 定位用户节点 + 节点跳转
// @match        *://claude.ai/chat/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const host = window.location.hostname;
    const path = window.location.pathname;
    const isClaude = /^claude\.ai$/i.test(host) && /^\/chat(?:\/[0-9a-f-]{36})?\/?$/i.test(path);
    if (!isClaude) return;

    const STATE = {
        captureInstalled: false,
        capturedHeaders: {},
        apiNodes: [],
        domNodes: [],
        railDots: [],
        activeApiIndex: -1,
        jumpTaskSeq: 0,
        readingLineRatio: 0.42,
        panel: null,
        railWrap: null,
        overlayWrap: null,
        outputEl: null,
        statusEl: null,
        activeRefreshPending: false,
        activeRefreshLoopTimer: null,
        domMutationDebounceTimer: null,
        autoRefreshTimer: null,
        autoRefreshInFlight: false,
        lastAutoRefreshAt: 0
    };

    const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, Number(ms) || 0)));

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

    function getConversationIdFromUrl() {
        const m = String(window.location.pathname || '').match(/^\/chat\/([0-9a-f-]{36})\/?$/i);
        return m ? String(m[1] || '').trim() : '';
    }

    function getOrgIdFromCookie() {
        const m = document.cookie.match(/(?:^|;\s*)lastActiveOrg=([^;]+)/);
        return m ? decodeURIComponent(m[1]) : '';
    }

    function installCaptureHooks() {
        if (STATE.captureInstalled) return;
        STATE.captureInstalled = true;

        const isClaudeConvUrl = (rawUrl) => {
            try {
                const u = new URL(rawUrl, window.location.origin);
                return /^\/api\/organizations\/[^/]+\/chat_conversations\/[0-9a-f-]+$/i.test(u.pathname);
            } catch (_) {
                return false;
            }
        };

        const rawFetch = window.fetch;
        window.fetch = function (input, init) {
            try {
                const inputUrl = typeof input === 'string' ? input : input?.url;
                const url = inputUrl ? new URL(inputUrl, window.location.origin).toString() : '';
                if (url && isClaudeConvUrl(url)) {
                    STATE.capturedHeaders = sanitizeHeaders({
                        ...STATE.capturedHeaders,
                        ...parseHeadersObject(typeof input !== 'string' ? input?.headers : null),
                        ...parseHeadersObject(init?.headers)
                    });
                }
            } catch (_) {}
            return rawFetch.apply(this, arguments);
        };

        const nativeOpen = XMLHttpRequest.prototype.open;
        const nativeSetHeader = XMLHttpRequest.prototype.setRequestHeader;
        const nativeSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url, ...rest) {
            this.__claudeUrl = url;
            this.__claudeHeaders = {};
            return nativeOpen.call(this, method, url, ...rest);
        };

        XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
            if (this.__claudeHeaders) this.__claudeHeaders[String(name).toLowerCase()] = String(value);
            return nativeSetHeader.call(this, name, value);
        };

        XMLHttpRequest.prototype.send = function (body) {
            try {
                const fullUrl = this.__claudeUrl ? new URL(this.__claudeUrl, window.location.origin).toString() : '';
                if (fullUrl && isClaudeConvUrl(fullUrl)) {
                    STATE.capturedHeaders = sanitizeHeaders({
                        ...STATE.capturedHeaders,
                        ...(this.__claudeHeaders || {})
                    });
                }
            } catch (_) {}
            return nativeSend.call(this, body);
        };
    }

    function getMainContentRoot() {
        return document.querySelector('#main-content') || document.querySelector('main') || document.body;
    }

    function getScrollContainer() {
        const root = getMainContentRoot();
        const candidates = Array.from(root.querySelectorAll('div,section,article,main'));
        let best = null;
        let bestCap = -1;
        for (const el of candidates) {
            if (!(el instanceof HTMLElement)) continue;
            const s = window.getComputedStyle(el);
            const oy = String(s.overflowY || '').toLowerCase();
            const cap = (el.scrollHeight || 0) - (el.clientHeight || 0);
            if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && cap > 40) {
                if (cap > bestCap) {
                    best = el;
                    bestCap = cap;
                }
            }
        }
        return best || document.scrollingElement || document.documentElement;
    }

    function getReadingLineY() {
        return Math.round(window.innerHeight * STATE.readingLineRatio);
    }

    function getClaudeUserBlocks() {
        const root = getMainContentRoot();
        if (!root) return [];
        const headings = Array.from(root.querySelectorAll('h2, [role="heading"]'));
        const out = [];
        const seen = new Set();
        headings.forEach((h) => {
            if (!(h instanceof HTMLElement)) return;
            const ht = normalizeText(h.innerText || '').toLowerCase();
            if (!ht.includes('you said')) return;
            const msgRoot = resolveClaudeMessageContainerFromHeading(h, root);
            if (!(msgRoot instanceof HTMLElement) || seen.has(msgRoot)) return;
            seen.add(msgRoot);
            out.push(msgRoot);
        });
        return out;
    }

    function resolveClaudeMessageContainerFromHeading(headingEl, root) {
        if (!(headingEl instanceof HTMLElement)) return null;
        let cur = headingEl.closest('div') || headingEl.parentElement;
        let best = null;
        let bestScore = -Infinity;
        const maxW = window.innerWidth * 0.96;
        for (let i = 0; i < 10 && cur && cur !== root.parentElement; i += 1) {
            if (!(cur instanceof HTMLElement)) break;
            if (!root.contains(cur)) break;
            const rect = cur.getBoundingClientRect();
            const txt = normalizeText(cur.innerText || '').toLowerCase();
            const width = rect.width || 0;
            const height = rect.height || 0;
            if (txt.includes('you said') && width >= 260 && width <= maxW && height >= 28 && height <= 1200) {
                let score = 0;
                score += Math.max(0, 1600 - Math.abs(width - Math.min(980, window.innerWidth * 0.72)));
                score += Math.max(0, 900 - height);
                if (/max-w-|mx-auto|group|contents|message/i.test(String(cur.className || ''))) score += 120;
                if (score > bestScore) {
                    bestScore = score;
                    best = cur;
                }
            }
            cur = cur.parentElement;
        }
        return best || (headingEl.closest('div')?.parentElement || headingEl.closest('div') || null);
    }

    function extractBlockUserText(blockEl) {
        if (!(blockEl instanceof HTMLElement)) return '';
        const heading = blockEl.querySelector('h2, [role="heading"]');
        const headingText = normalizeText(heading?.innerText || heading?.textContent || '');
        const m = headingText.match(/you said:\s*(.*)$/i);
        if (m && m[1]) return normalizeText(m[1]);
        const all = normalizeText(blockEl.innerText || '');
        return all.replace(/^you said:\s*/i, '').trim();
    }

    function normalizeForMatch(text) {
        return normalizeText(text).toLowerCase();
    }

    function collectClaudeMessageCandidates() {
        const root = getMainContentRoot();
        if (!root) return [];
        const out = [];
        const seen = new Set();
        const sels = [
            '[data-message-id]',
            '[data-testid*="message"]',
            '[data-testid*="human"]',
            'article',
            'section',
            'div'
        ];
        sels.forEach((sel) => {
            root.querySelectorAll(sel).forEach((el) => {
                if (!(el instanceof HTMLElement) || seen.has(el)) return;
                if (el.closest('#claude-nodes-test-panel, #claude-nodes-test-rail, #ai-nodes-nav-wrapper')) return;
                const txt = normalizeForMatch(el.innerText || '');
                if (!txt || !txt.includes('you said')) return;
                const rect = el.getBoundingClientRect();
                if (rect.width < 120 || rect.height < 18) return;
                if (rect.height > Math.max(window.innerHeight * 0.8, 720)) return;
                if ((el.children?.length || 0) > 40) return;
                seen.add(el);
                out.push(el);
            });
        });
        return out;
    }

    function findBlockBySourceMessageId(sourceMessageId) {
        const id = String(sourceMessageId || '').trim().toLowerCase();
        if (!id) return null;
        const root = getMainContentRoot();
        if (!root) return null;
        const all = root.querySelectorAll('[id],[data-message-id],[data-testid],[data-message-uuid],[data-node-id]');
        for (const el of all) {
            if (!(el instanceof HTMLElement)) continue;
            const attrs = [
                el.id || '',
                el.getAttribute('data-message-id') || '',
                el.getAttribute('data-message-uuid') || '',
                el.getAttribute('data-node-id') || '',
                el.getAttribute('data-testid') || ''
            ].join(' ').toLowerCase();
            if (!attrs.includes(id)) continue;
            const h = el.matches('h2,[role="heading"]') ? el : el.querySelector('h2,[role="heading"]');
            const block = resolveClaudeMessageContainerFromHeading(h, root)
                || el.closest('article, section, [data-message-id], div');
            if (!(block instanceof HTMLElement)) continue;
            const txt = normalizeForMatch(block.innerText || '');
            if (!txt.includes('you said')) continue;
            const rect = block.getBoundingClientRect();
            if (rect.width < 120 || rect.height < 18) continue;
            if (rect.height > Math.max(window.innerHeight * 0.8, 720)) continue;
            return block;
        }
        return null;
    }

    function findDomElementForApiNode(apiNode) {
        const byId = findBlockBySourceMessageId(apiNode?.sourceMessageId || apiNode?.id || '');
        if (byId) return byId;
        const blocks = getClaudeUserBlocks();
        const candidates = blocks.length ? blocks : collectClaudeMessageCandidates();
        if (!candidates.length) return null;
        const target = normalizeForMatch(apiNode?.text || '');
        if (!target) return null;
        const targetHead = target.slice(0, 80);
        let best = null;
        let bestScore = -1;
        for (const el of candidates) {
            const txt = normalizeForMatch(extractBlockUserText(el));
            if (!txt) continue;
            let score = 0;
            if (txt === target) score += 8;
            if (targetHead && txt.includes(targetHead)) score += 5;
            if (txt.includes(target.slice(0, 24))) score += 3;
            if (txt.includes(target.slice(0, 12))) score += 1;
            const rect = el.getBoundingClientRect();
            const area = Math.max(1, rect.width * rect.height);
            score -= Math.min(5, area / 220000);
            if (score > bestScore) {
                bestScore = score;
                best = el;
            }
        }
        return bestScore >= 2 ? best : null;
    }

    function scanDomNodes() {
        const cleanupDomUserText = (input) => {
            let t = normalizeText(input || '')
                .replace(/^you said:\s*/i, '')
                .replace(/\b\d{4}年\d{1,2}月\d{1,2}日\b/g, '')
                .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, '')
                .trim();
            const parts = t.split(' ').filter(Boolean);
            if (parts.length >= 4 && parts.length % 2 === 0) {
                const half = parts.length / 2;
                const a = parts.slice(0, half).join(' ');
                const b = parts.slice(half).join(' ');
                if (a === b) t = a;
            }
            const m = t.match(/^(.{2,}?)\s+\1$/i);
            if (m && m[1]) t = m[1].trim();
            return t.trim();
        };

        const blocks = getClaudeUserBlocks();
        const out = [];
        blocks.forEach((el, idx) => {
            let text = '';
            text = cleanupDomUserText(extractBlockUserText(el));
            if (!text) {
                text = cleanupDomUserText(el?.innerText || '');
            }
            if (!text) return;
            out.push({
                id: String(el.getAttribute('data-message-id') || `dom-user-${idx + 1}`),
                role: 'user',
                text,
                sessionIndex: idx,
                element: el
            });
        });
        STATE.domNodes = out;
        return out;
    }

    function extractClaudeTextFromContent(content) {
        if (!Array.isArray(content)) return '';
        return content
            .map((part) => {
                if (!part || typeof part !== 'object') return '';
                if (part.type === 'text') return String(part.text || '');
                return '';
            })
            .filter(Boolean)
            .join('\n')
            .trim();
    }

    function parseMessagesFromResponse(respJson) {
        const list = Array.isArray(respJson?.chat_messages) ? respJson.chat_messages : [];
        const out = [];
        let userIdx = 0;
        list.forEach((m) => {
            const sender = String(m?.sender || '').toLowerCase();
            if (sender !== 'human') return;
            const text = normalizeText(extractClaudeTextFromContent(m?.content));
            if (!text) return;
            out.push({
                id: String(m?.uuid || `claude-user-${userIdx + 1}`),
                sourceMessageId: String(m?.uuid || ''),
                role: 'user',
                text,
                sessionIndex: userIdx,
                element: null
            });
            userIdx += 1;
        });
        return out;
    }

    async function fetchApiNodes() {
        installCaptureHooks();
        const convId = getConversationIdFromUrl();
        const orgId = getOrgIdFromCookie();
        if (!convId || !orgId) throw new Error('缺少 orgId 或 conversationId');

        const url = `https://claude.ai/api/organizations/${encodeURIComponent(orgId)}/chat_conversations/${encodeURIComponent(convId)}?tree=True&rendering_mode=messages&render_all_tools=true&consistency=strong`;
        const resp = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: sanitizeHeaders(STATE.capturedHeaders || {})
        });
        if (!resp.ok) throw new Error(`请求失败: ${resp.status}`);
        const json = await resp.json();
        const nodes = parseMessagesFromResponse(json);
        STATE.apiNodes = nodes;
        return nodes;
    }

    function setStatus(text) {
        if (STATE.statusEl) STATE.statusEl.textContent = String(text || '');
    }

    function print(text) {
        if (!STATE.outputEl) return;
        STATE.outputEl.textContent = String(text || '');
    }

    function markActiveDot(idx) {
        STATE.activeApiIndex = idx;
        (STATE.railDots || []).forEach((dot, i) => {
            const active = i === idx;
            dot.style.background = active ? 'linear-gradient(180deg,#22d3ee,#0ea5e9)' : 'rgba(15,23,42,.9)';
            dot.style.color = active ? '#042f2e' : '#e2e8f0';
            dot.style.borderColor = active ? 'rgba(34,211,238,.95)' : 'rgba(148,163,184,.45)';
            dot.style.boxShadow = active ? '0 0 0 3px rgba(34,211,238,.22)' : 'none';
        });
        renderPositionOverlay();
    }

    function ensureOverlayWrap() {
        if (STATE.overlayWrap && STATE.overlayWrap.isConnected) return STATE.overlayWrap;
        const el = document.createElement('div');
        el.id = 'claude-nodes-test-overlay';
        el.style.cssText = [
            'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;',
            'z-index:2147483590;'
        ].join('');
        document.body.appendChild(el);
        STATE.overlayWrap = el;
        return el;
    }

    function renderPositionOverlay() {
        const wrap = ensureOverlayWrap();
        wrap.innerHTML = '';
        const nodes = STATE.apiNodes || [];
        if (!nodes.length) return;

        const readingY = getReadingLineY();
        const guide = document.createElement('div');
        guide.style.cssText = [
            'position:fixed;left:0;top:0;right:0;height:0;border-top:1px dashed rgba(34,211,238,.45);',
            `transform:translateY(${readingY}px);`,
            'pointer-events:none;'
        ].join('');
        wrap.appendChild(guide);

        nodes.forEach((node, idx) => {
            const el = findDomElementForApiNode(node);
            if (!(el instanceof HTMLElement)) return;
            const anchor = getMessageVisualAnchor(el);
            const r = (anchor || el).getBoundingClientRect();
            if (r.bottom < -40 || r.top > window.innerHeight + 40) return;
            const y = Math.max(8, Math.min(window.innerHeight - 8, r.top + 20));
            const x = Math.max(6, Math.round(r.left - 26));
            const active = idx === STATE.activeApiIndex;

            const dot = document.createElement('div');
            dot.style.cssText = [
                'position:fixed;left:0;top:0;transform:translate(0,0);',
                `margin-left:${x}px;margin-top:${Math.round(y - 9)}px;`,
                'width:18px;height:18px;border-radius:999px;display:flex;align-items:center;justify-content:center;',
                'font:700 10px/1 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;',
                `background:${active ? 'rgba(14,165,233,.95)' : 'rgba(15,23,42,.82)'};`,
                `color:${active ? '#042f2e' : '#e2e8f0'};`,
                `border:1px solid ${active ? 'rgba(34,211,238,.95)' : 'rgba(148,163,184,.55)'};`,
                `box-shadow:${active ? '0 0 0 2px rgba(34,211,238,.25)' : 'none'};`,
                'pointer-events:none;'
            ].join('');
            dot.textContent = String(idx + 1);
            wrap.appendChild(dot);
        });
    }

    function getMessageVisualAnchor(blockEl) {
        if (!(blockEl instanceof HTMLElement)) return null;
        const cands = Array.from(blockEl.querySelectorAll('div,article,section'));
        let best = null;
        let bestScore = -Infinity;
        for (const el of cands) {
            if (!(el instanceof HTMLElement)) continue;
            const rect = el.getBoundingClientRect();
            if (rect.width < 260 || rect.height < 24 || rect.height > 900) continue;
            let score = 0;
            if (/max-w-|mx-auto|prose|markdown|group/i.test(String(el.className || ''))) score += 120;
            score += Math.max(0, 1400 - Math.abs(rect.width - Math.min(940, window.innerWidth * 0.68)));
            score -= rect.top < 0 ? 30 : 0;
            if (score > bestScore) {
                bestScore = score;
                best = el;
            }
        }
        return best;
    }

    function refreshActiveNodeState() {
        if (STATE.activeRefreshPending) return;
        STATE.activeRefreshPending = true;
        requestAnimationFrame(() => {
            STATE.activeRefreshPending = false;
            const nodes = STATE.apiNodes || [];
            if (!nodes.length) return;
            const readingY = getReadingLineY();
            let bestIdx = -1;
            let bestDelta = Number.POSITIVE_INFINITY;
            nodes.forEach((n, idx) => {
                const el = findDomElementForApiNode(n);
                if (!el) return;
                const r = el.getBoundingClientRect();
                if (r.bottom <= 0 || r.top >= window.innerHeight) return;
                const center = r.top + r.height * 0.5;
                const delta = Math.abs(center - readingY);
                if (delta < bestDelta) {
                    bestDelta = delta;
                    bestIdx = idx;
                }
            });
            if (bestIdx >= 0) markActiveDot(bestIdx);
            else renderPositionOverlay();
        });
    }

    function startActiveRefreshLoop() {
        if (STATE.activeRefreshLoopTimer) return;
        STATE.activeRefreshLoopTimer = setInterval(() => {
            if (document.hidden) return;
            refreshActiveNodeState();
        }, 420);
    }

    function scrollByOn(sc, delta) {
        if (!sc) return;
        if (sc === document.scrollingElement || sc === document.documentElement) {
            window.scrollBy(0, delta);
        } else {
            sc.scrollTop += delta;
        }
    }

    async function tryFindWithDirectionalScroll(apiNode, goingDown = true, maxSteps = 20, token = 0) {
        const sc = getScrollContainer();
        let found = findDomElementForApiNode(apiNode);
        if (found) return found;
        for (let i = 0; i < maxSteps; i += 1) {
            if (token && token !== STATE.jumpTaskSeq) return null;
            scrollByOn(sc, goingDown ? 320 : -320);
            await sleep(80);
            found = findDomElementForApiNode(apiNode);
            if (found) return found;
        }
        return null;
    }

    async function alignToReadingLine(el, token = 0) {
        const sc = getScrollContainer();
        for (let i = 0; i < 6; i += 1) {
            if (token && token !== STATE.jumpTaskSeq) return false;
            const rect = el.getBoundingClientRect();
            const centerY = rect.top + rect.height * 0.5;
            const delta = centerY - getReadingLineY();
            if (Math.abs(delta) < 10) break;
            if (sc === document.scrollingElement || sc === document.documentElement) {
                window.scrollBy({ top: delta, behavior: 'smooth' });
            } else {
                sc.scrollBy({ top: delta, behavior: 'smooth' });
            }
            await sleep(120);
        }
        return true;
    }

    async function jumpToApiNode(apiNode, idx, token = 0) {
        let el = findDomElementForApiNode(apiNode);
        if (!el) {
            const down = idx >= Math.max(STATE.activeApiIndex, 0);
            el = await tryFindWithDirectionalScroll(apiNode, down, 22, token);
        }
        if (!el) {
            setStatus('jump-miss');
            return;
        }
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await sleep(180);
        if (token && token !== STATE.jumpTaskSeq) return;
        await alignToReadingLine(el, token);
        if (token && token !== STATE.jumpTaskSeq) return;
        markActiveDot(idx);
        refreshActiveNodeState();
        renderPositionOverlay();
        setStatus(`jump-${idx + 1}`);
    }

    function renderRail() {
        if (!STATE.railWrap) return;
        const content = STATE.railWrap.querySelector('[data-role="rail-content"]');
        if (!content) return;
        content.innerHTML = '';
        STATE.railDots = [];

        const nodes = STATE.apiNodes || [];
        if (!nodes.length) {
            const empty = document.createElement('div');
            empty.textContent = '无节点';
            empty.style.cssText = 'color:#94a3b8;font:12px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;text-align:center;padding-top:8px;';
            content.appendChild(empty);
            markActiveDot(-1);
            return;
        }

        nodes.forEach((n, idx) => {
            const row = document.createElement('div');
            row.style.cssText = 'display:flex;align-items:center;justify-content:center;margin:0 0 6px 0;';
            const dot = document.createElement('button');
            dot.type = 'button';
            dot.textContent = String(idx + 1);
            dot.title = shortText(n.text, 120);
            dot.style.cssText = [
                'width:30px;height:30px;border-radius:999px;border:1px solid rgba(148,163,184,.45)',
                'background:rgba(15,23,42,.9);color:#e2e8f0;cursor:pointer;font-size:12px;font-weight:700;line-height:1;',
                'transition:all .18s ease;box-shadow:none;'
            ].join(';');
            dot.addEventListener('click', async () => {
                const token = ++STATE.jumpTaskSeq;
                markActiveDot(idx);
                setStatus(`jumping-${idx + 1}`);
                await jumpToApiNode(STATE.apiNodes[idx], idx, token);
            });
            row.appendChild(dot);
            content.appendChild(row);
            STATE.railDots.push(dot);
        });

        markActiveDot(STATE.activeApiIndex);
        renderPositionOverlay();
    }

    function calcMatchReport() {
        const nodes = STATE.apiNodes || [];
        const doms = STATE.domNodes || [];
        const lines = [];
        lines.push(`会话=${getConversationIdFromUrl()} API用户节点=${nodes.length} DOM用户节点=${doms.length}`);
        nodes.forEach((n, i) => {
            const el = findDomElementForApiNode(n);
            const mark = el ? '✓' : '✗';
            lines.push(`[${i + 1}] ${mark} id=${n.id}  ${shortText(n.text, 56)}`);
        });
        if (doms.length) {
            lines.push('--- DOM ---');
            doms.forEach((n, i) => {
                lines.push(`[D${i + 1}] ${shortText(n.text, 56)}`);
            });
        }
        return lines.join('\n');
    }

    function scheduleDomDrivenSync() {
        if (STATE.domMutationDebounceTimer) clearTimeout(STATE.domMutationDebounceTimer);
        STATE.domMutationDebounceTimer = setTimeout(() => {
            STATE.domMutationDebounceTimer = null;
            refreshActiveNodeState();
        }, 120);
    }

    async function runAutoApiRefresh() {
        const now = Date.now();
        if (STATE.autoRefreshInFlight) return;
        if (now - STATE.lastAutoRefreshAt < 1600) return;
        STATE.autoRefreshInFlight = true;
        try {
            await fetchApiNodes();
            scanDomNodes();
            renderRail();
            refreshActiveNodeState();
        } catch (_) {
            // noop
        } finally {
            STATE.lastAutoRefreshAt = Date.now();
            STATE.autoRefreshInFlight = false;
        }
    }

    function mountPanel() {
        if (STATE.panel && STATE.panel.isConnected) return;

        const panel = document.createElement('div');
        panel.id = 'claude-nodes-test-panel';
        panel.style.cssText = [
            'position:fixed;right:16px;top:88px;z-index:2147483600;',
            'background:rgba(15,23,42,.94);color:#e2e8f0;border:1px solid rgba(148,163,184,.35);',
            'border-radius:10px;padding:10px;width:280px;box-shadow:0 10px 24px rgba(0,0,0,.28);',
            'font:12px/1.45 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;'
        ].join('');

        const title = document.createElement('div');
        title.textContent = 'Claude Nodes Test';
        title.style.cssText = 'font-weight:700;margin-bottom:8px;';

        const btnFetch = document.createElement('button');
        btnFetch.type = 'button';
        btnFetch.textContent = '抓取 API 节点';
        btnFetch.style.cssText = 'margin-right:6px;padding:6px 8px;border-radius:7px;border:1px solid #334155;background:#0ea5e9;color:#06283d;cursor:pointer;font-weight:700;';

        const btnReport = document.createElement('button');
        btnReport.type = 'button';
        btnReport.textContent = '刷新映射';
        btnReport.style.cssText = 'padding:6px 8px;border-radius:7px;border:1px solid #334155;background:#22c55e;color:#052e16;cursor:pointer;font-weight:700;';

        const btnDom = document.createElement('button');
        btnDom.type = 'button';
        btnDom.textContent = '抓取 DOM 节点';
        btnDom.style.cssText = 'margin-left:6px;padding:6px 8px;border-radius:7px;border:1px solid #334155;background:#f59e0b;color:#3f2a00;cursor:pointer;font-weight:700;';

        const status = document.createElement('span');
        status.textContent = 'ready';
        status.style.cssText = 'display:inline-block;margin-left:8px;color:#93c5fd;';

        const output = document.createElement('pre');
        output.style.cssText = 'margin:8px 0 0;max-height:220px;overflow:auto;white-space:pre-wrap;background:rgba(2,6,23,.55);padding:8px;border-radius:8px;border:1px solid rgba(51,65,85,.7);';

        btnFetch.addEventListener('click', async () => {
            setStatus('fetching...');
            try {
                const list = await fetchApiNodes();
                scanDomNodes();
                setStatus(`ok:${list.length}`);
                print(calcMatchReport());
                renderRail();
                refreshActiveNodeState();
            } catch (e) {
                setStatus('fetch-failed');
                print(`[抓取失败] ${e?.message || e}`);
            }
        });

        btnReport.addEventListener('click', () => {
            scanDomNodes();
            print(calcMatchReport());
            renderRail();
            refreshActiveNodeState();
            setStatus('mapped');
        });

        btnDom.addEventListener('click', () => {
            const list = scanDomNodes();
            print(calcMatchReport());
            setStatus(`dom:${list.length}`);
            refreshActiveNodeState();
        });

        panel.appendChild(title);
        panel.appendChild(btnFetch);
        panel.appendChild(btnReport);
        panel.appendChild(btnDom);
        panel.appendChild(status);
        panel.appendChild(output);
        document.body.appendChild(panel);

        const railWrap = document.createElement('div');
        railWrap.id = 'claude-nodes-test-rail';
        railWrap.style.cssText = [
            'position:fixed;right:312px;top:88px;z-index:2147483599;',
            'width:46px;height:calc(100vh - 120px);padding:8px 6px;background:rgba(2,6,23,.72);',
            'border:1px solid rgba(148,163,184,.35);border-radius:10px;box-shadow:0 10px 24px rgba(0,0,0,.25);'
        ].join('');
        railWrap.innerHTML = '<div data-role="rail-content" style="position:relative;height:100%;overflow:auto;padding-right:2px;"></div>';
        document.body.appendChild(railWrap);

        STATE.panel = panel;
        STATE.railWrap = railWrap;
        STATE.outputEl = output;
        STATE.statusEl = status;

        renderRail();
    }

    function bootstrap() {
        installCaptureHooks();
        mountPanel();

        const mo = new MutationObserver(() => scheduleDomDrivenSync());
        mo.observe(document.documentElement || document.body, { childList: true, subtree: true });

        const sc = getScrollContainer();
        if (sc && sc.addEventListener) sc.addEventListener('scroll', refreshActiveNodeState, { passive: true });
        window.addEventListener('scroll', refreshActiveNodeState, { passive: true });
        window.addEventListener('resize', renderPositionOverlay, { passive: true });
        startActiveRefreshLoop();

        STATE.autoRefreshTimer = setInterval(runAutoApiRefresh, 1800);
    }

    bootstrap();
})();
