// ==UserScript==
// @name         AI对话助手
// @namespace    http://tampermonkey.net/
// @version      1.6.6
// @description  支持 ChatGPT、通义千问、豆包、DeepSeek：自动生成对话节点导航、一键导出对话（PDF/Markdown/JSON/CSV/TXT）。
// @author       xchengb
// @updateURL    https://gitee.com/xcb157342/ai-chat-nodes/raw/master/AI%E5%AF%B9%E8%AF%9D%E5%8A%A9%E6%89%8B.user.js
// @downloadURL  https://gitee.com/xcb157342/ai-chat-nodes/raw/master/AI%E5%AF%B9%E8%AF%9D%E5%8A%A9%E6%89%8B.user.js
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDMyIDMyIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIGZpbGw9Im5vbmUiLz48cGF0aCBmaWxsPSIjMDQwMGU2IiBkPSJNMTYgMTlhNi45OSAxNi45OSAwIDAgMS01LjgzMy0zLjEyOWwxLjY2Ni0xLjEwN2E1IDUgMCAwIDAgOC4zMzQgMGwxLjY2NiAxLjEwN0E2Ljk5IDYuOTkgMCAwIDEgMTYgMTl6Ii8+PGNpcmNsZSBjeD0iMjAyMCIgY3k9IjEwIiByPSIyIiBmaWxsPSIjMDQwMGU2Ii8+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMCIgcj0iMiIgZmlsbD0iIzA0MDBlNiIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTAiIHI9IjIiIGZpbGw9IiMwNDAwZTYiLz48Y2lyY2xlIGN4PSIxMiIgY3k9IjEwIiByPSIyIiBmaWxsPSIjMDQwMGU2Ii8+PHBhdGggZmlsbD0iIzA0MDBlNiIgZD0iTTE3LjczNiAzMEwxNiAyOWw0LTdoNmEyIDIgMCAwIDAgMi0yVjZhMiAyIDAgMCAwLTItMkg2YTIgMiAwIDAgMC0yIDJ2MTRhMiAyIDAgMCAwIDIgMmg5djJINmE0IDQgMCAwIDEtNC00VjZhNCA0IDAgMCAxIDQtNGgyMGE0IDQgMCAwIDEgNCA0djE0YTQgNCAwIDAgMS00IDRoLTQuODM1eiIvPjwvc3ZnPg==
// @match        *://chatgpt.com/*
// @match        *://chat.openai.com/*
// @match        *://tongyi.aliyun.com/*
// @match        *://*.qianwen.com/*
// @match        *://www.doubao.com/*
// @match        *://chat.deepseek.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const host = window.location.hostname;
    const isChatGPT = /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/i.test(host);
    const isQwen = host.includes('aliyun.com') || host.includes('qianwen.com');
    const isDoubao = host.includes('doubao.com');
    const isDeepSeek = host.includes('deepseek.com');
    const AI_NAME = isChatGPT ? 'ChatGPT' : (isDeepSeek ? 'DeepSeek' : (isDoubao ? '豆包' : (isQwen ? '通义千问' : 'AI 助手')));

    let nodes = [];
    let nodesMap = new Map(); // 用于持久化记录节点，防止虚拟列表回收导致消失
    let lastCount = 0;
    let currentConvId = '';
    let storageKey = '';
    const COLLAPSE_KEY = 'ai-nodes-auto-collapse-qwen';
    const ADS_KEY = 'ai-nodes-remove-qwen-ads';
    
    let isHistoryFullyLoaded = false; // 用户要求的缓存机制：标记当前对话历史是否已全量加载过
    let activeNodeId = null; // 存储 ID 而非 DOM 引用，防止重绘后状态失效
    let searchIntervalId = null; // 独立计时器驱动的自动搜寻 ID
    let isNodeSearching = false;
    let qwenInitUnlockInProgress = false;
    let qwenVirtualNodesCache = [];
    let qwenVirtualNodesLoading = false;
    let qwenVirtualNodesLoaded = false;
    let qwenVirtualNodesLastFetchAt = 0;
    let deepseekVirtualNodesCache = [];
    let deepseekVirtualNodesLoading = false;
    let deepseekVirtualNodesLoaded = false;
    let deepseekVirtualNodesLastFetchAt = 0;
    let deepseekCapturedHeaders = null;
    let deepseekCaptureHooksInstalled = false;
    let deepseekLastSessionMeta = null;
    const DEEPSEEK_HISTORY_PATH = '/api/v0/chat/history_messages';

    function getConvId() {
        const path = window.location.pathname;
        // 兼容不同平台的 URL 结构
        return path.split('/').filter(p => p.length > 5).pop() || 'default';
    }

    function updateStorageKey() {
        const newId = getConvId();
        if (newId !== currentConvId) {
            currentConvId = newId;
            storageKey = `ai-nodes-history-${currentConvId}`;
            isHistoryFullyLoaded = false; // 切换对话时重置加载状态
            if (isQwen) {
                qwenVirtualNodesCache = [];
                qwenVirtualNodesLoaded = false;
                qwenVirtualNodesLastFetchAt = 0;
            }
            if (isDeepSeek) {
                deepseekVirtualNodesCache = [];
                deepseekVirtualNodesLoaded = false;
                deepseekVirtualNodesLastFetchAt = 0;
                deepseekLastSessionMeta = null;
            }
            return true;
        }
        return false;
    }
    
    updateStorageKey();
    
    let ticking = false;
    let autoCollapse = localStorage.getItem(COLLAPSE_KEY) === 'true';
    let removeAds = localStorage.getItem(ADS_KEY) === 'true';

    const CONFIG = {
        topGap: 80,
        bottomGap: 24,
        right: 10,
        panelWidth: 80,
        scrollWidth: 64,
        trackWidth: 4,
        dotSize: 11,
        dotBorder: 2,
        dotGap: 36,
        maxVisibleDotsBeforeScroll: 12
    };

    // ===== 全局共享 Tooltip (单例模式，防止渲染泄露) =====
    const globalTooltip = document.createElement('div');
    globalTooltip.className = 'ai-chat-tooltip';
    globalTooltip.style.cssText = `
        position: fixed;
        background: rgba(255, 255, 255, 0.95);
        color: #1a1a1a;
        padding: 10px 14px;
        border-radius: 10px;
        font-size: 13px;
        line-height: 1.5;
        width: max-content;
        max-width: 280px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        pointer-events: none;
        opacity: 0;
        z-index: 10000;
        border: 1px solid rgba(0, 0, 0, 0.05);
        backdrop-filter: blur(8px);
        white-space: pre-wrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 4;
        -webkit-box-orient: vertical;
        transition: none;
        transform: translateY(10px) scale(0.95);
    `;
    document.body.appendChild(globalTooltip);

    // ===== 最外层固定容器 =====
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.right = CONFIG.right + 'px';
    container.style.top = CONFIG.topGap + 'px';
    container.style.width = CONFIG.panelWidth + 'px';
    container.style.height = `calc(100vh - ${CONFIG.topGap + CONFIG.bottomGap}px)`;
    container.style.zIndex = '9999';
    container.style.pointerEvents = 'auto';
    container.style.overflow = 'visible';
    container.style.display = 'flex';
    container.style.alignItems = 'center';
    container.style.flexDirection = 'column';
    container.style.paddingTop = '10px';
    document.body.appendChild(container);

    // ===== 滚动条样式优化 =====
    const styleTag = document.createElement('style');
    styleTag.innerHTML = `
        .ai-navigator-scroll::-webkit-scrollbar {
            width: 3px;
        }
        .ai-navigator-scroll::-webkit-scrollbar-track {
            background: transparent;
        }
        .ai-navigator-scroll::-webkit-scrollbar-thumb {
            background: rgba(150, 150, 150, 0.2);
            border-radius: 10px;
        }
        .ai-navigator-scroll::-webkit-scrollbar-thumb:hover {
            background: rgba(150, 150, 150, 0.5);
        }
        /* 千问去广告样式 */
        body.ai-nodes-hide-ads [data-c="result_card"],
        body.ai-nodes-hide-ads [class*="card_card_video"],
        body.ai-nodes-hide-ads [data-tpl*="card_video"],
        body.ai-nodes-hide-ads [class*="video_note_list"],
        body.ai-nodes-hide-ads [class*="container-3D4Pp"] {
            display: none !important;
        }
        /* 节点标识样式优化 */
        .ai-nav-dot {
            box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        }
        .ai-dot-history { 
            opacity: 0.4; 
            filter: grayscale(0.5) contrast(0.9); 
        }
        .ai-dot-session { 
            opacity: 1;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));
        }
        .ai-dot-new-badge {
            position: absolute;
            right: -5px;
            top: -5px;
            width: 7px;
            height: 7px;
            background: #ff4d4f;
            border: 1.5px solid #fff;
            border-radius: 50%;
            z-index: 10;
            box-shadow: 0 0 4px rgba(0,0,0,0.2);
        }
        @keyframes ai-dot-glow {
            0% { 
                box-shadow: 0 0 0 0 rgba(77, 121, 255, 0.6); 
                transform: translate(-50%, -50%) scale(1);
            }
            50% {
                transform: translate(-50%, -50%) scale(1.15);
            }
            70% { 
                box-shadow: 0 0 0 8px rgba(77, 121, 255, 0); 
                transform: translate(-50%, -50%) scale(1);
            }
            100% { 
                box-shadow: 0 0 0 0 rgba(77, 121, 255, 0); 
            }
        }
        .ai-dot-latest {
            animation: ai-dot-glow 2.5s infinite ease-in-out;
        }
    `;
    document.head.appendChild(styleTag);

    if (removeAds) document.body.classList.add('ai-nodes-hide-ads');

    // ===== 拖拽手柄 =====
    const dragHandle = document.createElement('div');
    dragHandle.style.width = '32px';
    dragHandle.style.height = '4px';
    dragHandle.style.background = 'rgba(160, 160, 160, 0.3)';
    dragHandle.style.borderRadius = '10px';
    dragHandle.style.margin = '0 auto 16px';
    dragHandle.style.cursor = 'grab';
    dragHandle.style.flexShrink = '0';
    dragHandle.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    dragHandle.title = '拖动调整位置';
    container.prepend(dragHandle);
    dragHandle.onmouseleave = () => dragHandle.style.background = 'rgba(150, 150, 150, 0.4)';

    let isDragging = false;
    let startX, startY, startRight, startTop;

    dragHandle.addEventListener('mousedown', (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startRight = parseInt(getComputedStyle(container).right);
        startTop = parseInt(getComputedStyle(container).top);
        dragHandle.style.cursor = 'grabbing';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const deltaX = startX - e.clientX; 
        const deltaY = e.clientY - startY;
        
        // 约束拖拽范围，不超出页面
        const maxRight = window.innerWidth - CONFIG.panelWidth;
        const maxTop = window.innerHeight - 30; // 预留手柄高度
        
        const newRight = Math.max(0, Math.min(maxRight, startRight + deltaX));
        const newTop = Math.max(0, Math.min(maxTop, startTop + deltaY));
        
        container.style.right = newRight + 'px';
        container.style.top = newTop + 'px';
        container.style.height = `calc(100vh - ${newTop + CONFIG.bottomGap}px)`;
        
        localStorage.setItem('ai-chat-nodes-pos', JSON.stringify({ right: newRight, top: newTop }));
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            dragHandle.style.cursor = 'grab';
            document.body.style.userSelect = '';
        }
    });

    // 读取保存的位置
    const savedPos = JSON.parse(localStorage.getItem('ai-chat-nodes-pos'));
    if (savedPos) {
        container.style.right = savedPos.right + 'px';
        container.style.top = savedPos.top + 'px';
        container.style.height = `calc(100vh - ${savedPos.top + CONFIG.bottomGap}px)`;
    }

    // ===== 滚动层：只负责垂直滚动，不裁切圆点横向空间 =====
    const scrollArea = document.createElement('div');
    scrollArea.className = 'ai-navigator-scroll';
    scrollArea.style.position = 'relative';
    scrollArea.style.width = CONFIG.scrollWidth + 'px';
    scrollArea.style.height = '100%';
    scrollArea.style.overflowY = 'auto';
    scrollArea.style.overflowX = 'visible';
    scrollArea.style.scrollBehavior = 'smooth';
    scrollArea.style.boxSizing = 'border-box';
    scrollArea.style.padding = '0';
    container.appendChild(scrollArea);

    // ===== 内容层：给轨道和圆点留完整空间 =====
    const content = document.createElement('div');
    content.style.position = 'relative';
    content.style.width = '100%';
    content.style.minHeight = '100%';
    content.style.overflow = 'visible';
    scrollArea.appendChild(content);

    // ===== 轨道 =====
    const track = document.createElement('div');
    track.style.position = 'absolute';
    track.style.left = '50%';
    track.style.transform = 'translateX(-50%)';
    track.style.width = CONFIG.trackWidth + 'px';
    track.style.background = 'linear-gradient(180deg, rgba(200, 200, 200, 0.15) 0%, rgba(200, 200, 200, 0.3) 50%, rgba(200, 200, 200, 0.15) 100%)';
    track.style.borderRadius = '10px';
    track.style.backdropFilter = 'blur(1px)';
    track.style.boxSizing = 'border-box';
    track.style.boxShadow = 'inset 0 0 1px rgba(255, 255, 255, 0.2)';
    content.appendChild(track);

    // ===== 节点层：宽于轨道，避免圆点被裁切 =====
    const dotsLayer = document.createElement('div');
    dotsLayer.style.position = 'absolute';
    dotsLayer.style.left = '0';
    dotsLayer.style.top = '0';
    dotsLayer.style.width = '100%';
    dotsLayer.style.height = '100%';
    dotsLayer.style.overflow = 'visible';
    content.appendChild(dotsLayer);

    function getMessages() {
        const list = [];
        // 使用全局变量 host
        if (isChatGPT) {
            const msgs = document.querySelectorAll('[data-message-author-role]');
            msgs.forEach((el, index) => {
                const textEl = el.querySelector('.whitespace-pre-wrap');
                if (!textEl) return;
                const text = (textEl.innerText || '').trim();
                if (!text) return;
                if (el.getAttribute('data-message-author-role') === 'user') {
                    const id = el.getAttribute('data-message-id') || index;
                    list.push({
                        id: id,
                        element: textEl, // 修改：高亮文字容器
                        role: 'user',
                        text: text
                    });
                }
            });
        } else if (host.includes('aliyun.com') || host.includes('qianwen.com')) {
            scheduleQwenVirtualNodesRefresh();
            qwenVirtualNodesCache.forEach((item) => list.push(item));
        } else if (host.includes('doubao.com')) {
            // 豆包适配：精确查找用户消息块
            const msgs = document.querySelectorAll('[data-testid="send_message"]');
            msgs.forEach((el, index) => {
                // 查找文字内容容器，如果不存在则查找其父容器
                const textEl = el.querySelector('[data-testid="message_text_content"]') || el;
                let text = (textEl.innerText || '').trim();
                
                if (!text) return;

                const id = el.getAttribute('data-id') || index;
                list.push({
                    id: id,
                    element: textEl, // 修改：高亮消息气泡部位
                    role: 'user',
                    text: text
                });
            });
        } else if (host.includes('deepseek.com')) {
            scheduleDeepSeekVirtualNodesRefresh();
            deepseekVirtualNodesCache.forEach((item) => list.push(item));
        }

        return list;
    }

    function hashStr(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString(36);
    }

    function highlightMessage(el) {
        // 已移除指示器反馈，保持静默跳转
    }

    function parseDeepSeekHeaders(headersLike) {
        if (!headersLike) return {};
        if (headersLike instanceof Headers) {
            const out = {};
            headersLike.forEach((v, k) => out[String(k).toLowerCase()] = String(v));
            return out;
        }
        if (Array.isArray(headersLike)) {
            const out = {};
            headersLike.forEach((pair) => {
                if (!Array.isArray(pair) || pair.length < 2) return;
                out[String(pair[0]).toLowerCase()] = String(pair[1]);
            });
            return out;
        }
        if (typeof headersLike === 'object') {
            const out = {};
            Object.entries(headersLike).forEach(([k, v]) => {
                out[String(k).toLowerCase()] = String(v);
            });
            return out;
        }
        return {};
    }

    function sanitizeDeepSeekHeaders(inputHeaders) {
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

        if (!out.accept) out.accept = 'application/json, text/plain, */*';
        return out;
    }

    function isDeepSeekHistoryUrl(rawUrl) {
        try {
            const u = new URL(rawUrl, window.location.origin);
            return u.pathname.includes(DEEPSEEK_HISTORY_PATH);
        } catch (e) {
            return false;
        }
    }

    function isLikelyUuid(str) {
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(str || '').trim());
    }

    function getDeepSeekSessionIdFromLocation() {
        try {
            const u = new URL(window.location.href);
            const fromQuery = u.searchParams.get('chat_session_id') || u.searchParams.get('session_id') || u.searchParams.get('id');
            if (isLikelyUuid(fromQuery)) return fromQuery;

            const pathMatch = u.pathname.match(/\/a\/chat\/s\/([0-9a-f-]{36})/i)
                || u.pathname.match(/\/chat\/([0-9a-f-]{36})/i)
                || u.pathname.match(/\/session\/([0-9a-f-]{36})/i);
            if (pathMatch && isLikelyUuid(pathMatch[1])) return pathMatch[1];

            if (u.hash) {
                const hashMatch = u.hash.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
                if (hashMatch && isLikelyUuid(hashMatch[1])) return hashMatch[1];
            }
        } catch (e) {
            // ignore
        }
        return '';
    }

    function getDeepSeekSessionIdFromLinks() {
        const linkCandidates = Array.from(document.querySelectorAll('a[href*="/a/chat/s/"]'));
        for (const a of linkCandidates) {
            const href = String(a.getAttribute('href') || '');
            const m = href.match(/\/a\/chat\/s\/([0-9a-f-]{36})/i);
            if (m && isLikelyUuid(m[1])) return m[1];
        }
        return '';
    }

    function getDeepSeekSessionIdCandidates() {
        const convFromRoute = isLikelyUuid(currentConvId) ? currentConvId : '';
        const candidates = [
            getDeepSeekSessionIdFromLocation(),
            getDeepSeekSessionIdFromLinks(),
            convFromRoute,
            sessionStorage.getItem('deepseek_api_test_last_session_id') || '',
            localStorage.getItem('deepseek_api_test_last_session_id') || ''
        ].map((v) => String(v || '').trim()).filter(Boolean);
        return Array.from(new Set(candidates));
    }

    function getDeepSeekSessionId() {
        const candidates = getDeepSeekSessionIdCandidates();
        return candidates.find(isLikelyUuid) || '';
    }

    function installDeepSeekCaptureHooks() {
        if (!isDeepSeek || deepseekCaptureHooksInstalled) return;
        deepseekCaptureHooksInstalled = true;

        const rawFetch = window.fetch;
        window.fetch = function (input, init) {
            try {
                const inputUrl = typeof input === 'string' ? input : input?.url;
                const url = inputUrl ? new URL(inputUrl, window.location.origin).toString() : '';
                if (url && isDeepSeekHistoryUrl(url)) {
                    deepseekCapturedHeaders = sanitizeDeepSeekHeaders({
                        ...parseDeepSeekHeaders(input?.headers),
                        ...parseDeepSeekHeaders(init?.headers)
                    });
                }
            } catch (e) {
                // ignore
            }
            return rawFetch.apply(this, arguments);
        };

        const rawOpen = XMLHttpRequest.prototype.open;
        const rawSetHeader = XMLHttpRequest.prototype.setRequestHeader;
        const rawSend = XMLHttpRequest.prototype.send;

        XMLHttpRequest.prototype.open = function (method, url) {
            this.__aiNodesDeepSeekUrl = url;
            this.__aiNodesDeepSeekHeaders = {};
            return rawOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
            try {
                if (this.__aiNodesDeepSeekHeaders) {
                    this.__aiNodesDeepSeekHeaders[String(k).toLowerCase()] = String(v);
                }
            } catch (e) {
                // ignore
            }
            return rawSetHeader.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function () {
            try {
                if (this.__aiNodesDeepSeekUrl && isDeepSeekHistoryUrl(this.__aiNodesDeepSeekUrl)) {
                    deepseekCapturedHeaders = sanitizeDeepSeekHeaders(this.__aiNodesDeepSeekHeaders || {});
                }
            } catch (e) {
                // ignore
            }
            return rawSend.apply(this, arguments);
        };
    }

    function safeParseDeepSeekJson(text) {
        try {
            return JSON.parse(text);
        } catch (e) {
            return null;
        }
    }

    function extractDeepSeekText(node, bucket) {
        if (!node) return;
        if (typeof node === 'string') {
            const t = node.trim();
            if (t) bucket.push(t);
            return;
        }
        if (Array.isArray(node)) {
            node.forEach((item) => extractDeepSeekText(item, bucket));
            return;
        }
        if (typeof node !== 'object') return;

        const directKeys = ['text', 'content', 'message', 'msg', 'answer', 'question', 'value', 'display_text'];
        directKeys.forEach((k) => {
            if (typeof node[k] === 'string') {
                const t = node[k].trim();
                if (t) bucket.push(t);
            }
        });

        Object.values(node).forEach((v) => extractDeepSeekText(v, bucket));
    }

    function guessDeepSeekRole(item) {
        const raw = String(item?.role || item?.sender_role || item?.author_role || item?.message_type || '').toUpperCase();
        if (raw === 'USER') return 'user';
        if (raw === 'ASSISTANT') return 'assistant';
        const low = raw.toLowerCase();
        if (low.includes('assistant') || low.includes('bot') || low.includes('ai')) return 'assistant';
        if (low.includes('user') || low.includes('human') || low.includes('question')) return 'user';
        if (item?.from_user === true || item?.is_user === true) return 'user';
        if (item?.from_bot === true || item?.is_assistant === true) return 'assistant';
        return 'assistant';
    }

    function formatDeepSeekSearchFragment(frag) {
        const lines = [];
        if (typeof frag?.content === 'string' && frag.content.trim()) {
            lines.push(frag.content.trim());
        }

        const results = Array.isArray(frag?.results) ? frag.results : [];
        if (results.length) {
            lines.push('【智能搜索结果】');
            results.forEach((r, i) => {
                const title = String(r?.title || '').trim();
                const url = String(r?.url || '').trim();
                const snippet = String(r?.snippet || '').trim();
                const prefix = `${i + 1}. ${title || '未命名结果'}`;
                lines.push(prefix);
                if (url) lines.push(`   链接: ${url}`);
                if (snippet) lines.push(`   摘要: ${snippet}`);
            });
        }

        return lines.join('\n').trim();
    }

    function buildDeepSeekCitationMapFromFragments(fragments) {
        const map = new Map();
        const arr = Array.isArray(fragments) ? fragments : [];

        arr.forEach((frag) => {
            const t = String(frag?.type || frag?.content_type || '').toUpperCase();
            if (t !== 'SEARCH') return;

            const results = Array.isArray(frag?.results) ? frag.results : [];
            results.forEach((r, idx) => {
                const keyRaw = r?.cite_index != null ? r.cite_index : (idx + 1);
                const key = Number(keyRaw);
                if (!Number.isFinite(key) || key <= 0) return;
                if (map.has(key)) return;

                map.set(key, {
                    title: String(r?.title || '').trim(),
                    url: String(r?.url || '').trim(),
                    snippet: String(r?.snippet || '').trim()
                });
            });
        });

        return map;
    }

    function adaptDeepSeekCitationText(text, citationMap) {
        const raw = String(text || '');
        if (!raw) return '';
        const map = citationMap instanceof Map ? citationMap : new Map();
        const used = new Set();

        const replaced = raw.replace(/\[citation\s*:\s*(\d+)\]/gi, (_, nStr) => {
            const n = Number(nStr);
            if (Number.isFinite(n) && n > 0) used.add(n);
            return `[参考#${nStr}]`;
        });

        if (!used.size) return replaced;

        const lines = ['【引用来源】'];
        Array.from(used).sort((a, b) => a - b).forEach((n) => {
            const ref = map.get(n);
            if (!ref) {
                lines.push(`[参考#${n}]`);
                return;
            }
            lines.push(`[参考#${n}] ${ref.title || '未命名来源'}`);
            if (ref.url) lines.push(`链接: ${ref.url}`);
        });

        return `${replaced.trim()}\n\n${lines.join('\n')}`.trim();
    }

    function parseDeepSeekMessagesFromResponse(resp) {
        const bizData = resp?.data?.biz_data;
        const chatMessages = Array.isArray(bizData?.chat_messages) ? bizData.chat_messages : [];
        if (!chatMessages.length) return [];
        const out = [];

        chatMessages.forEach((msg, idx) => {
            const msgId = String(msg?.message_id || idx + 1);
            const status = String(msg?.status || '');
            const baseRole = guessDeepSeekRole(msg);
            const fragments = Array.isArray(msg?.fragments) ? msg.fragments : [];
            const citationMap = buildDeepSeekCitationMapFromFragments(fragments);

            const pushFragmentMessage = (text, fragmentType, role, isThought = false, isSearch = false, fragmentId = '') => {
                const clean = String(text || '').trim();
                if (!clean) return;
                out.push({
                    id: fragmentId ? `${msgId}-${fragmentType}-${fragmentId}` : `${msgId}-${fragmentType}`,
                    role,
                    text: clean,
                    status,
                    fragmentType,
                    isThought,
                    isSearch
                });
            };

            if (fragments.length) {
                const orderedFragments = fragments
                    .map((frag, fragIdx) => ({ frag, fragIdx }))
                    .sort((a, b) => {
                        const typeA = String(a?.frag?.type || a?.frag?.content_type || '').toUpperCase() || 'UNKNOWN';
                        const typeB = String(b?.frag?.type || b?.frag?.content_type || '').toUpperCase() || 'UNKNOWN';

                        const rankFor = (t) => {
                            // DeepSeek 助手消息固定顺序：思考过程 -> AI回答 -> 智能搜索
                            if (baseRole === 'assistant') {
                                if (t === 'THINK') return 10;
                                if (t === 'RESPONSE') return 20;
                                if (t === 'SEARCH') return 30;
                                if (t === 'REQUEST') return 90;
                                return 80;
                            }
                            if (t === 'REQUEST') return 10;
                            return 80;
                        };

                        const diff = rankFor(typeA) - rankFor(typeB);
                        if (diff !== 0) return diff;
                        return a.fragIdx - b.fragIdx;
                    });

                orderedFragments.forEach(({ frag, fragIdx }) => {
                    const fragmentType = String(frag?.type || frag?.content_type || '').toUpperCase() || 'UNKNOWN';
                    const fragmentId = String(frag?.id || fragIdx + 1);

                    if (fragmentType === 'REQUEST') {
                        const text = typeof frag?.content === 'string' ? frag.content : '';
                        pushFragmentMessage(text, fragmentType, 'user', false, false, fragmentId);
                        return;
                    }

                    if (fragmentType === 'RESPONSE') {
                        const text = adaptDeepSeekCitationText(typeof frag?.content === 'string' ? frag.content : '', citationMap);
                        pushFragmentMessage(text, fragmentType, 'assistant', false, false, fragmentId);
                        return;
                    }

                    if (fragmentType === 'THINK') {
                        const text = adaptDeepSeekCitationText(typeof frag?.content === 'string' ? frag.content : '', citationMap);
                        pushFragmentMessage(text, fragmentType, 'assistant', true, false, fragmentId);
                        return;
                    }

                    if (fragmentType === 'SEARCH') {
                        // 搜索结果不再直接展示/导出，仅用于 citation 引用映射
                        return;
                    }

                    const bucket = [];
                    extractDeepSeekText(frag, bucket);
                    const fallbackText = Array.from(new Set(bucket.map((s) => String(s || '').trim()).filter(Boolean))).join('\n\n').trim();
                    pushFragmentMessage(fallbackText, fragmentType, baseRole, false, false, fragmentId);
                });
                return;
            }

            const bucket = [];
            extractDeepSeekText(msg, bucket);
            const fallbackText = Array.from(new Set(bucket.map((s) => String(s || '').trim()).filter(Boolean))).join('\n\n').trim();
            if (!fallbackText) return;

            out.push({
                id: msgId,
                role: baseRole,
                text: fallbackText,
                status,
                fragmentType: 'MESSAGE',
                isThought: false,
                isSearch: false
            });
        });

        return out;
    }

    function createDeepSeekHistoryUrl(sessionId) {
        const u = new URL(DEEPSEEK_HISTORY_PATH, window.location.origin);
        u.searchParams.set('chat_session_id', sessionId);
        return u.toString();
    }

    function formatDeepSeekTs(tsValue) {
        const n = Number(tsValue);
        if (!Number.isFinite(n) || n <= 0) return '';
        const ms = n > 1e12 ? n : Math.round(n * 1000);
        const d = new Date(ms);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString();
    }

    function collectDeepSeekMessageStats(chatMessages) {
        const out = {
            totalMessages: 0,
            requestCount: 0,
            responseCount: 0,
            thinkCount: 0,
            searchCount: 0,
            finishedCount: 0,
            sample: []
        };

        const arr = Array.isArray(chatMessages) ? chatMessages : [];
        out.totalMessages = arr.length;

        arr.forEach((msg) => {
            const status = String(msg?.status || '').toUpperCase();
            if (status === 'FINISHED') out.finishedCount += 1;

            const fragments = Array.isArray(msg?.fragments) ? msg.fragments : [];
            fragments.forEach((frag) => {
                const t = String(frag?.type || frag?.content_type || '').toUpperCase();
                if (t === 'REQUEST') out.requestCount += 1;
                else if (t === 'RESPONSE') out.responseCount += 1;
                else if (t === 'THINK') out.thinkCount += 1;
                else if (t === 'SEARCH') out.searchCount += 1;
            });

            if (out.sample.length < 8) {
                out.sample.push({
                    messageId: String(msg?.message_id || ''),
                    role: String(msg?.role || ''),
                    status: String(msg?.status || ''),
                    thinkingEnabled: Boolean(msg?.thinking_enabled),
                    searchEnabled: Boolean(msg?.search_enabled),
                    insertedAt: formatDeepSeekTs(msg?.inserted_at),
                    fragmentCount: fragments.length
                });
            }
        });

        return out;
    }

    function extractDeepSeekSessionMeta(resp) {
        const bizData = resp?.data?.biz_data;
        const chatSession = bizData?.chat_session || null;
        const chatMessages = Array.isArray(bizData?.chat_messages) ? bizData.chat_messages : [];
        if (!chatSession && !chatMessages.length) return null;

        return {
            chatSession: chatSession
                ? {
                    id: String(chatSession.id || ''),
                    title: String(chatSession.title || ''),
                    titleType: String(chatSession.title_type || ''),
                    pinned: Boolean(chatSession.pinned),
                    updatedAt: formatDeepSeekTs(chatSession.updated_at),
                    seqId: chatSession.seq_id == null ? '' : String(chatSession.seq_id),
                    agent: String(chatSession.agent || ''),
                    version: chatSession.version == null ? '' : String(chatSession.version),
                    currentMessageId: chatSession.current_message_id == null ? '' : String(chatSession.current_message_id),
                    insertedAt: formatDeepSeekTs(chatSession.inserted_at)
                }
                : null,
            messageStats: collectDeepSeekMessageStats(chatMessages)
        };
    }

    async function getDeepSeekMessagesByApi() {
        if (!isDeepSeek) return [];
        installDeepSeekCaptureHooks();

        const sessionId = getDeepSeekSessionId();
        if (!sessionId) {
            console.warn('AI-Chat-Nodes: DeepSeek 未找到会话 ID，无法请求 history_messages');
            return [];
        }

        sessionStorage.setItem('deepseek_api_test_last_session_id', sessionId);
        localStorage.setItem('deepseek_api_test_last_session_id', sessionId);

        try {
            const resp = await fetch(createDeepSeekHistoryUrl(sessionId), {
                method: 'GET',
                credentials: 'include',
                headers: sanitizeDeepSeekHeaders(deepseekCapturedHeaders || {})
            });

            if (!resp.ok) {
                console.warn(`AI-Chat-Nodes: DeepSeek history_messages 请求失败 (${resp.status})`);
                return [];
            }

            const text = await resp.text();
            const json = safeParseDeepSeekJson(text);
            if (!json) {
                console.warn('AI-Chat-Nodes: DeepSeek history_messages 返回非 JSON');
                return [];
            }

            deepseekLastSessionMeta = extractDeepSeekSessionMeta(json);

            return parseDeepSeekMessagesFromResponse(json);
        } catch (e) {
            console.warn('AI-Chat-Nodes: DeepSeek history_messages 解析失败', e);
            return [];
        }
    }

    function normalizeDeepSeekTextForMatch(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim();
    }

    function getDeepSeekUserDomCandidates() {
        const visibleArea = document.querySelector('.ds-virtual-list-visible-items') || document.body;
        const rows = Array.from(visibleArea.querySelectorAll('._81e7b5e, .ds-message'));
        const out = [];
        const seen = new Set();

        rows.forEach((el) => {
            const isUser = el.classList.contains('_19d617c') || (!el.querySelector('.ds-markdown') && !el.querySelector('.ds-think-content') && !el.querySelector('.ds-thought-content'));
            if (!isUser) return;

            const bubble = el.querySelector('._72b6158') || el.querySelector('.ds-message-item--content') || el;
            const text = normalizeDeepSeekTextForMatch(bubble.innerText || '');
            if (!text || text === '深度思考' || text === '联网搜索') return;

            const key = text.slice(0, 80);
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ element: bubble, text });
        });

        return out;
    }

    function isDeepSeekElementMatchNode(element, node) {
        if (!element || !node) return false;
        if (!element.isConnected) return false;

        const elText = normalizeDeepSeekTextForMatch(element.innerText || '');
        const nodeText = normalizeDeepSeekTextForMatch(node.text || '');
        if (!elText || !nodeText) return false;

        const prefix = nodeText.slice(0, Math.min(28, nodeText.length));
        if (prefix && elText.includes(prefix)) return true;
        if (nodeText.length <= 24) return elText === nodeText;
        return false;
    }

    function findDeepSeekDomElementByNode(node) {
        if (!node || !node.text) return null;
        const candidates = getDeepSeekUserDomCandidates();
        const targetText = normalizeDeepSeekTextForMatch(node.text);
        const targetPrefix = targetText.slice(0, Math.min(52, targetText.length));
        const targetMiddle = targetText.slice(Math.max(0, Math.floor(targetText.length / 2) - 18), Math.floor(targetText.length / 2) + 18);

        let bestEl = null;
        let bestScore = -1;

        candidates.forEach((c) => {
            const txt = c.text;
            let score = 0;
            if (txt === targetText) score += 8;
            if (targetPrefix && txt.includes(targetPrefix)) score += 5;
            if (targetMiddle && txt.includes(targetMiddle)) score += 3;
            if (targetPrefix && targetText.includes(txt.slice(0, Math.min(24, txt.length)))) score += 2;

            if (score > bestScore) {
                bestScore = score;
                bestEl = c.element;
            }
        });

        return bestScore >= 5 ? bestEl : null;
    }

    function scheduleDeepSeekVirtualNodesRefresh(force = false) {
        if (!isDeepSeek || deepseekVirtualNodesLoading) return;

        const now = Date.now();
        if (!force && (now - deepseekVirtualNodesLastFetchAt < 2500)) return;

        deepseekVirtualNodesLoading = true;
        deepseekVirtualNodesLastFetchAt = now;

        getDeepSeekMessagesByApi().then((apiMsgs) => {
            if (!Array.isArray(apiMsgs) || !apiMsgs.length) {
                deepseekVirtualNodesLoaded = true;
                return;
            }

            const userMsgs = apiMsgs.filter((m) => m && m.role === 'user' && m.text);
            if (!userMsgs.length) {
                deepseekVirtualNodesLoaded = true;
                return;
            }

            const built = userMsgs.map((m, idx) => {
                const text = String(m.text || '').trim();
                const id = `deepseek-user-${String(m.id || idx + 1)}`;
                const element = findDeepSeekDomElementByNode({ text });
                return {
                    id,
                    role: 'user',
                    text,
                    element: element || null
                };
            }).filter((m) => m.text);

            if (!built.length) {
                deepseekVirtualNodesLoaded = true;
                return;
            }

            deepseekVirtualNodesCache = built;
            deepseekVirtualNodesLoaded = true;

            requestAnimationFrame(() => {
                update();
            });
        }).catch((e) => {
            console.warn('AI-Chat-Nodes: DeepSeek 虚拟节点刷新失败', e);
        }).finally(() => {
            deepseekVirtualNodesLoading = false;
        });
    }

    function jumpToMessage(el, nodeId) {
        if (searchIntervalId) {
            clearInterval(searchIntervalId);
            searchIntervalId = null;
        }

        let targetEl = el;
        const node = nodesMap.get(nodeId);

        if (isQwen && (!targetEl || !targetEl.isConnected) && node) {
            targetEl = findQwenDomElementByNode(node);
            if (targetEl) {
                node.element = targetEl;
            }
        }
        if (isDeepSeek && (!targetEl || !targetEl.isConnected) && node) {
            targetEl = findDeepSeekDomElementByNode(node);
            if (targetEl) {
                node.element = targetEl;
            }
        }
        
        // 核心加固：验证 DOM 节点是否被“回收复用” (Virtual List 防抖)
        const isElementValid = (element, expectedNode) => {
            if (!element || !element.isConnected) return false;
            if (isQwen) {
                return isQwenElementMatchNode(element, expectedNode);
            }
            if (isDeepSeek) {
                return isDeepSeekElementMatchNode(element, expectedNode);
            }
            // 验证内容摘要，防止跳到已被回收复用的错误位置
            const currentText = element.innerText || '';
            const expectedText = expectedNode.text || '';
            // 只要开头和长度大致匹配即可认为有效（避免细微格式差异干扰）
            return currentText.includes(expectedText.slice(0, 20));
        };

        // 如果原引用失效或被回收，尝试在当前 DOM 动态重新寻址
        if (node && !isElementValid(targetEl, node)) {
            const currentBatch = getMessages();
            const fresh = currentBatch.find(m => m.id === nodeId);
            targetEl = fresh ? fresh.element : null;
            if (!targetEl && isQwen) {
                targetEl = findQwenDomElementByNode(node);
            }
            if (!targetEl && isDeepSeek) {
                targetEl = findDeepSeekDomElementByNode(node);
            }
        }

        // 如果仍然没有找到有效节点（说明目标已彻底不在当前视口内），启动深度搜寻
        if (!targetEl) {
            console.warn(`AI-Chat-Nodes: 目标节点 ${nodeId} 已被回收或不在视野内，启动深度搜寻...`);
            startNodeSearch(nodeId);
            return false;
        }
        
        const scrollEl = getScrollContainer();
        const executeJump = (offsetVal = 165) => { 
            const rect = targetEl.getBoundingClientRect();
            const containerRect = (scrollEl === window || scrollEl === document.documentElement) 
                ? { top: 0 } 
                : scrollEl.getBoundingClientRect();
            
            const targetTop = scrollEl.scrollTop + rect.top - containerRect.top - offsetVal;
            
            if (typeof scrollEl.scrollTo === 'function') {
                scrollEl.scrollTo({ top: targetTop, behavior: 'smooth' });
            } else {
                window.scrollTo({ top: targetTop, behavior: 'smooth' });
            }
        };

        if (scrollEl) {
            executeJump(165);
            // 针对千问增加“二次跳跃”机制
            if ((isQwen || isDeepSeek) && !isNodeSearching) {
                setTimeout(() => { if(isElementValid(targetEl, node)) executeJump(165); }, 300);
            }
        } else {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        highlightMessage(targetEl);
        return true;
    }

    function normalizeQwenTextForMatch(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim();
    }

    function isQwenElementMatchNode(element, node) {
        if (!element || !node) return false;
        if (!element.isConnected) return false;

        const nodeText = normalizeQwenTextForMatch(node.text || '');
        if (!nodeText) return false;

        const elText = normalizeQwenTextForMatch(element.innerText || '');
        if (!elText) return false;

        const prefix = nodeText.slice(0, Math.min(28, nodeText.length));
        if (prefix && elText.includes(prefix)) return true;

        // 文本较短时要求更严格，避免错绑到其它节点
        if (nodeText.length <= 20) {
            return elText === nodeText;
        }

        return false;
    }

    function getQwenUserDomCandidates() {
        const selector = [
            '[class*="questionItem"][data-msgid]',
            '[class*="question-item"][data-msgid]',
            '[data-msgid][class*="question"]',
            '[data-msg-id][class*="question"]',
            '[class*="question"] [class*="bubble"]',
            '[class*="question"] [class*="contentBox"]'
        ].join(',');

        const raw = Array.from(document.querySelectorAll(selector));
        const seen = new Set();
        const out = [];

        raw.forEach((el) => {
            const row = el.matches('[class*="bubble"], [class*="contentBox"]')
                ? (el.closest('[data-msgid]') || el.closest('[class*="questionItem"], [class*="question-item"], [class*="question"]') || el)
                : el;

            const bubble = row.querySelector('[class*="bubble"]') || row.querySelector('[class*="contentBox"]') || row;
            const text = normalizeQwenTextForMatch(bubble.innerText || '');
            if (!text) return;

            const rawId = String(
                row.getAttribute('data-msgid')
                || row.getAttribute('data-msg-id')
                || ''
            ).replace(/-question$/i, '').trim();

            const key = `${rawId}::${text.slice(0, 80)}`;
            if (seen.has(key)) return;
            seen.add(key);

            out.push({ id: rawId, element: bubble, text });
        });

        return out;
    }

    function getQwenConversationRows() {
        const selector = [
            '[class*="questionItem"]',
            '[class*="answerItem"]',
            '[class*="question-item"]',
            '[class*="answer-item"]'
        ].join(',');

        const rows = Array.from(document.querySelectorAll(selector));
        rows.sort((a, b) => {
            if (a === b) return 0;
            const pos = a.compareDocumentPosition(b);
            if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
        });
        return rows;
    }

    function getQwenRowType(row) {
        const cls = String(row?.className || '').toLowerCase();
        if (cls.includes('questionitem') || cls.includes('question-item') || cls.includes('question')) return 'question';
        if (cls.includes('answeritem') || cls.includes('answer-item') || cls.includes('answer')) return 'answer';
        return 'unknown';
    }

    function getQwenRowId(row) {
        const raw = String(
            row?.getAttribute?.('data-msgid')
            || row?.getAttribute?.('data-msg-id')
            || ''
        ).trim();
        if (!raw) return '';
        return raw.replace(/-(question|answer)$/i, '');
    }

    function getQwenRowText(row) {
        if (!row) return '';
        const bubble = row.querySelector('[class*="bubble"]') || row.querySelector('[class*="contentBox"]') || row;
        return normalizeQwenTextForMatch(bubble.innerText || '');
    }

    function findQwenNodeByIdOrText(id, text) {
        if (id && nodesMap.has(id)) return nodesMap.get(id);

        const normalized = normalizeQwenTextForMatch(text || '');
        if (!normalized) return null;

        return nodes.find((n) => {
            const t = normalizeQwenTextForMatch(n.text || '');
            if (!t) return false;
            const p1 = normalized.slice(0, Math.min(24, normalized.length));
            const p2 = t.slice(0, Math.min(24, t.length));
            return (p1 && t.includes(p1)) || (p2 && normalized.includes(p2));
        }) || null;
    }

    function resolveQwenNodeFromRow(row, rows) {
        if (!row) return null;
        const rowType = getQwenRowType(row);

        if (rowType === 'question') {
            return findQwenNodeByIdOrText(getQwenRowId(row), getQwenRowText(row));
        }

        if (rowType === 'answer') {
            const idx = rows.indexOf(row);
            for (let i = idx - 1; i >= 0; i--) {
                if (getQwenRowType(rows[i]) !== 'question') continue;
                const n = findQwenNodeByIdOrText(getQwenRowId(rows[i]), getQwenRowText(rows[i]));
                if (n) return n;
            }
        }

        return findQwenNodeByIdOrText(getQwenRowId(row), getQwenRowText(row));
    }

    function getQwenActiveNodeByConversationState(scrollEl) {
        const rows = getQwenConversationRows();
        if (!rows.length) return null;

        const isAtBottom = scrollEl && (scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight) < 50;

        if (isAtBottom) {
            const lastRow = rows[rows.length - 1];
            return resolveQwenNodeFromRow(lastRow, rows);
        }

        const anchor = 150;
        let bestRow = null;
        let minDist = Infinity;

        rows.forEach((row) => {
            const rect = row.getBoundingClientRect();
            if (!(rect.bottom > 0 && rect.top < window.innerHeight)) return;
            const dist = Math.abs(rect.top - anchor);
            if (dist < minDist) {
                minDist = dist;
                bestRow = row;
            }
        });

        if (!bestRow) return null;
        return resolveQwenNodeFromRow(bestRow, rows);
    }

    function findQwenDomElementById(nodeId) {
        if (!nodeId) return null;
        const candidates = getQwenUserDomCandidates();
        const hit = candidates.find((c) => c.id && c.id === String(nodeId));
        return hit ? hit.element : null;
    }

    function findQwenDomElementByNode(node) {
        if (!node || !node.text) return null;

        const candidates = getQwenUserDomCandidates();
        const targetText = normalizeQwenTextForMatch(node.text);
        const targetPrefix = targetText.slice(0, Math.min(48, targetText.length));
        const targetMiddle = targetText.slice(Math.max(0, Math.floor(targetText.length / 2) - 18), Math.floor(targetText.length / 2) + 18);

        let bestEl = null;
        let bestScore = -1;

        candidates.forEach((c) => {
            const msgIdRaw = c.id || '';
            const bubble = c.element;
            const txt = c.text;
            if (!txt) return;

            let score = 0;
            if (msgIdRaw && msgIdRaw === node.id) score += 10;
            if (txt === targetText) score += 8;
            if (targetPrefix && txt.includes(targetPrefix)) score += 6;
            if (targetMiddle && txt.includes(targetMiddle)) score += 4;
            if (targetPrefix && targetText.includes(txt.slice(0, Math.min(24, txt.length)))) score += 3;
            if (targetText && txt && (targetText.length > 20 || txt.length > 20)) {
                const a = targetText.slice(0, 24);
                const b = txt.slice(0, 24);
                if (a && b && a === b) score += 2;
            }

            if (score > bestScore) {
                bestScore = score;
                bestEl = bubble;
            }
        });

        return bestScore >= 6 ? bestEl : null;
    }

    function scheduleQwenVirtualNodesRefresh(force = false) {
        if (!isQwen || qwenVirtualNodesLoading) return;

        const now = Date.now();
        if (!force && (now - qwenVirtualNodesLastFetchAt < 4000)) return;

        qwenVirtualNodesLoading = true;
        qwenVirtualNodesLastFetchAt = now;

        getQwenMessagesByApi().then((apiMsgs) => {
            if (!Array.isArray(apiMsgs) || !apiMsgs.length) {
                qwenVirtualNodesLoaded = true;
                return;
            }

            const userMsgs = apiMsgs.filter((m) => m && m.role === 'user' && m.text);
            if (!userMsgs.length) {
                qwenVirtualNodesLoaded = true;
                return;
            }

            const built = userMsgs.map((m, idx) => {
                const id = String(m.id || `qwen-user-${idx + 1}`);
                const text = String(m.text || '').trim();
                // 仅做 ID 直连绑定，避免模糊匹配误绑导致跳转抖动
                const element = findQwenDomElementById(id);
                return {
                    id,
                    role: 'user',
                    text,
                    element: element || null
                };
            }).filter((m) => m.text);

            if (!built.length) {
                qwenVirtualNodesLoaded = true;
                return;
            }

            qwenVirtualNodesCache = built;
            qwenVirtualNodesLoaded = true;

            // API 节点数量变化时，触发一次增量刷新
            requestAnimationFrame(() => {
                update();
            });
        }).catch((e) => {
            console.warn('AI-Chat-Nodes: 千问虚拟节点刷新失败', e);
        }).finally(() => {
            qwenVirtualNodesLoading = false;
        });
    }

    function scrollDotIntoView(dot) {
        if (!dot) return;

        const areaRect = scrollArea.getBoundingClientRect();
        const dotRect = dot.getBoundingClientRect();

        const areaCenter = areaRect.top + areaRect.height / 2;
        const dotCenter = dotRect.top + dotRect.height / 2;
        const delta = dotCenter - areaCenter;

        scrollArea.scrollTop += delta;
    }

    function findNearestScrollableAncestor(el) {
        let p = el;
        while (p && p !== document.body) {
            const s = window.getComputedStyle(p);
            const overflowY = s.overflowY || '';
            const isScrollable = (overflowY === 'auto' || overflowY === 'scroll')
                && (p.scrollHeight - p.clientHeight > 16);
            if (isScrollable) return p;
            p = p.parentElement;
        }
        return null;
    }

    function getScrollContainer() {
        // 自动探测当前 AI 平台的主聊天滚动容器
        const host = window.location.hostname;
        if (host.includes('qianwen.com') || host.includes('aliyun.com')) {
            const qwenInner = document.querySelector('[class*="chatContent"]') || document.querySelector('[class*="messageList"]');
            if (qwenInner) {
                const realScroll = findNearestScrollableAncestor(qwenInner);
                if (realScroll) return realScroll;
                return qwenInner;
            }
        }
        
        for (const n of nodes) {
            if (n.element && n.element.isConnected) {
                let p = n.element.parentElement;
                while (p && p !== document.body) {
                    const s = window.getComputedStyle(p);
                    if ((s.overflowY === 'auto' || s.overflowY === 'scroll') && p.clientHeight > 200) return p;
                    p = p.parentElement;
                }
            }
        }
        // 备选方案
        return document.querySelector('main')?.parentElement || 
               document.querySelector('[class*="message-list"]') || 
               window;
    }

    function setActiveDot(dot, nodeId) {
        // 先重置当前所有圆点的样式（简单保险，防止多高亮残留）
        document.querySelectorAll('.ai-nav-dot').forEach(d => {
            d.style.boxShadow = '';
            d.style.transform = 'translate(-50%, -50%) scale(1)';
            d.style.zIndex = '2';
            d.style.borderColor = 'rgba(0, 0, 0, 0.2)';
            d.style.opacity = '0.5';
        });

        activeNodeId = nodeId;

        if (dot) {
            const glowColor = dot.style.background.includes('rgb') ? dot.style.background : '#46a758';
            dot.style.boxShadow = `0 0 0 4px #fff, 0 6px 16px rgba(0,0,0,0.2), 0 0 20px ${glowColor}`;
            dot.style.transform = 'translate(-50%, -50%) scale(1.8)';
            dot.style.zIndex = '10';
            dot.style.borderColor = '#fff';
            dot.style.opacity = '1';
        }
    }

    function buildDot(node, topPx) {
        const dot = document.createElement('div');
        dot.style.position = 'absolute';
        dot.style.left = '50%';
        dot.style.top = topPx + 'px';
        dot.style.transform = 'translate(-50%, -50%)';
        dot.style.width = CONFIG.dotSize + 'px';
        dot.style.height = CONFIG.dotSize + 'px';
        dot.style.borderRadius = '50%';
        dot.style.boxSizing = 'border-box';
        dot.style.cursor = 'pointer';
        dot.style.transition = 'all 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        dot.style.zIndex = '2';
        
        const userColor = 'linear-gradient(135deg, #1E88E5 0%, #1565C0 100%)';
        const aiColor = 'linear-gradient(135deg, #4FC3F7 0%, #03A9F4 100%)';
        
        dot.style.background = node.role === 'user' ? userColor : aiColor;
        dot.style.border = `${CONFIG.dotBorder}px solid #fff`;
        dot.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.15), inset 0 1px 2px rgba(255, 255, 255, 0.3)';
        dot.style.opacity = '0.5';
        
        // 应用历史/当前状态样式
        dot.className = `ai-nav-dot ${node.isHistory ? 'ai-dot-history' : 'ai-dot-session'}`;
        
        // 为最新会话节点添加呼吸灯
        if (!node.isHistory && nodes.indexOf(node) === nodes.length - 1) {
            dot.classList.add('ai-dot-latest');
        }

        // 首次发现提示
        if (!node.isHistory && !node.notified) {
            const badge = document.createElement('div');
            badge.className = 'ai-dot-new-badge';
            dot.appendChild(badge);
            setTimeout(() => badge.remove(), 5000);
            node.notified = true;
        }
        
        dot.addEventListener('mouseenter', () => {
            if (node.id !== activeNodeId) {
                dot.style.transform = 'translate(-50%, -50%) scale(1.45)';
            }
            
            globalTooltip.innerText = node.text.slice(0, 150) + (node.text.length > 150 ? '...' : '');
            
            const dotRect = dot.getBoundingClientRect();
            const winWidth = window.innerWidth;
            const winHeight = window.innerHeight;
            const isOnRightHalf = dotRect.left > winWidth / 2;
            
            globalTooltip.style.transition = 'none';
            
            if (isOnRightHalf) {
                globalTooltip.dataset.side = 'right';
                globalTooltip.style.left = (dotRect.left - 15) + 'px';
                globalTooltip.style.transform = 'translate(calc(-100% + 10px), -50%) scale(0.95)';
            } else {
                globalTooltip.dataset.side = 'left';
                globalTooltip.style.left = (dotRect.right + 15) + 'px';
                globalTooltip.style.transform = 'translate(-10px, -50%) scale(0.95)';
            }
            globalTooltip.style.top = (dotRect.top + dotRect.height / 2) + 'px';

            globalTooltip.offsetHeight; 

            globalTooltip.style.transition = 'opacity 0.2s ease, transform 0.2s cubic-bezier(0.18, 0.89, 0.32, 1.28)';
            
            requestAnimationFrame(() => {
                globalTooltip.style.opacity = '1';
                const finalTranslate = isOnRightHalf ? '-100%, -50%' : '0, -50%';
                globalTooltip.style.transform = `translate(${finalTranslate}) scale(1)`;
            });

            setTimeout(() => {
                const tooltipRect = globalTooltip.getBoundingClientRect();
                if (tooltipRect.bottom > winHeight - 10) {
                    globalTooltip.style.top = (winHeight - tooltipRect.height - 10) + (tooltipRect.height / 2) + 'px';
                }
                if (tooltipRect.top < 10) {
                    globalTooltip.style.top = (10 + tooltipRect.height / 2) + 'px';
                }
            }, 50);
        });

        dot.addEventListener('mouseleave', () => {
            if (node.id !== activeNodeId) {
                dot.style.transform = 'translate(-50%, -50%) scale(1)';
            }
            globalTooltip.style.opacity = '0';
            const side = globalTooltip.dataset.side || 'left';
            if (side === 'right') {
                globalTooltip.style.transform = 'translate(calc(-100% + 10px), -50%) scale(0.95)';
            } else {
                globalTooltip.style.transform = 'translate(-10px, -50%) scale(0.95)';
            }
        });

        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            // 直接调用 jumpToMessage 内部包含的寻址与搜寻逻辑
            const jumpedNow = jumpToMessage(node.element, node.id);
            if (jumpedNow) {
                setActiveDot(dot, node.id);
                scrollDotIntoView(dot);
            } else {
                // 搜寻模式下由滚动实时驱动激活节点，避免长时间锁定在目标点
                updateActiveNodeOnScroll();
            }
        });
        return dot;
    }

    /**
     * 启动独立计时器循环搜寻目标节点
     * 按目标方向持续平滑滚动，等待 DOM 懒加载
     * 命中目标节点后立即停止并执行精确跳转
     */
    function startNodeSearch(targetId) {
        // 先清理可能存在的旧计时器
        if (searchIntervalId) {
            clearInterval(searchIntervalId);
            searchIntervalId = null;
        }

        isNodeSearching = true;

        let attempts = 0;
        const TICK_MS = isQwen ? 110 : 160;
        const MAX_ATTEMPTS = 260;
        const targetIdx = nodes.findIndex(n => n.id === targetId);
        const activeIdx = nodes.findIndex(n => n.id === activeNodeId);
        const searchDirection = (targetIdx !== -1 && activeIdx !== -1 && targetIdx > activeIdx) ? 'down' : 'up';
        const stopSearch = () => {
            if (searchIntervalId) {
                clearInterval(searchIntervalId);
                searchIntervalId = null;
            }
            isNodeSearching = false;
            window.removeEventListener('wheel', onUserInterrupt, true);
            window.removeEventListener('touchstart', onUserInterrupt, true);
            window.removeEventListener('keydown', onUserInterrupt, true);
        };

        const isDirectionMatched = (element) => {
            if (!element || !element.getBoundingClientRect) return false;
            const rect = element.getBoundingClientRect();
            const anchor = window.innerHeight * 0.45;
            if (searchDirection === 'up') {
                // 向上搜时，不接受明显位于视口下半区的候选，避免“上去又回弹”
                return rect.top <= (anchor + 120);
            }
            // 向下搜时，不接受明显位于视口上半区的候选
            return rect.top >= (anchor - 120);
        };

        const onUserInterrupt = () => {
            console.log('AI-Chat-Nodes: 用户手动交互，中止自动搜寻。');
            stopSearch();
        };

        window.addEventListener('wheel', onUserInterrupt, true);
        window.addEventListener('touchstart', onUserInterrupt, true);
        window.addEventListener('keydown', onUserInterrupt, true);

        // 千问在“刚加载且停在底部”时可能有自动跟随，先执行一次脱离底部锁定
        if (isQwen && searchDirection === 'up') {
            const preScrollEl = getScrollContainer();
            if (preScrollEl && preScrollEl !== window && typeof preScrollEl.scrollBy === 'function') {
                preScrollEl.scrollBy({ top: -220, behavior: 'auto' });
            } else {
                window.scrollBy({ top: -220, behavior: 'auto' });
            }
        }

        function doSearchTick() {
            const targetNode = nodesMap.get(targetId);

            // 千问虚拟节点模式：每一轮先尝试重新映射 DOM 节点，命中后应立即停止上滚
            if (isQwen && targetNode && (!targetNode.element || !document.body.contains(targetNode.element))) {
                const rematched = findQwenDomElementByNode(targetNode);
                if (rematched && isDirectionMatched(rematched)) {
                    targetNode.element = rematched;
                }
            }
            if (isDeepSeek && targetNode && (!targetNode.element || !document.body.contains(targetNode.element))) {
                const rematched = findDeepSeekDomElementByNode(targetNode);
                if (rematched && isDirectionMatched(rematched)) {
                    targetNode.element = rematched;
                }
            }

            // 检查是否已经找到节点
            const found = targetNode
                && targetNode.element
                && document.body.contains(targetNode.element)
                && ((!isQwen && !isDeepSeek)
                    || (isQwen && isQwenElementMatchNode(targetNode.element, targetNode) && isDirectionMatched(targetNode.element))
                    || (isDeepSeek && isDeepSeekElementMatchNode(targetNode.element, targetNode) && isDirectionMatched(targetNode.element)));

            if (found) {
                stopSearch();
                console.log(` AI-Chat-Nodes: ✓ 找到节点 ${targetId}，正在跳转...`);
                jumpToMessage(targetNode.element, targetId);
                if (targetNode.dot) {
                    setActiveDot(targetNode.dot, targetId);
                    scrollDotIntoView(targetNode.dot);
                }
                return;
            }

            attempts++;
            if (attempts > MAX_ATTEMPTS) {
                stopSearch();
                console.warn(` AI-Chat-Nodes: ✗ 搜寻超时 (${MAX_ATTEMPTS} 次)，未找到节点 ${targetId}`);
                return;
            }

            console.log(` AI-Chat-Nodes: 搜寻中 (${attempts}/${MAX_ATTEMPTS}, dir=${searchDirection})...`);

            // 重新探测滚动容器（容器可能在 SPA 路由后变化）
            const scrollEl = getScrollContainer();
            if (scrollEl && scrollEl !== window && typeof scrollEl.scrollTo === 'function') {
                const ratio = isQwen ? 0.42 : 0.55;
                const baseStep = Math.floor((scrollEl.clientHeight || 700) * ratio);
                const step = Math.min(460, Math.max(160, baseStep));
                const delta = searchDirection === 'down' ? step : -step;
                // 搜寻阶段强调“连续快速推进”，使用 auto 避免 smooth 缓动叠加导致拖尾。
                scrollEl.scrollBy({ top: delta, behavior: 'auto' });
            } else {
                const viewportH = window.innerHeight || 800;
                const ratio = isQwen ? 0.42 : 0.55;
                const baseStep = Math.floor(viewportH * ratio);
                const step = Math.min(460, Math.max(160, baseStep));
                const delta = searchDirection === 'down' ? step : -step;
                window.scrollBy({ top: delta, behavior: 'auto' });
            }

            // 自动搜寻期间强制同步一次激活节点，提升过程反馈
            requestAnimationFrame(() => {
                updateActiveNodeOnScroll();
            });
        }

        // 立即执行第一次
        doSearchTick();
        // 高频探测：持续平滑滚动并等待 DOM 加载
        searchIntervalId = setInterval(doSearchTick, TICK_MS);
    }

    function getApproxLoadedMessageCount() {
        if (isQwen) {
            return document.querySelectorAll('[class*="questionItem"], [class*="answerItem"]').length;
        }
        if (isDoubao) {
            return document.querySelectorAll('[data-testid="send_message"], [data-testid="receive_message"]').length;
        }
        if (isDeepSeek) {
            return document.querySelectorAll('[class*="message"], [data-message-id], article').length;
        }
        return document.querySelectorAll('article, [data-turn]').length;
    }

    function maybeRunQwenInitialScrollUnlock(retry = 0) {
        if (!isQwen || qwenInitUnlockInProgress) return;

        const doneKey = `ai-nodes-qwen-init-unlock-${currentConvId}`;
        if (sessionStorage.getItem(doneKey) === '1') return;

        const qCount = document.querySelectorAll('[class*="questionItem"], [class*="question-item"]').length;
        const aCount = document.querySelectorAll('[class*="answerItem"], [class*="answer-item"]').length;
        const total = qCount + aCount;

        // 仅在“非新对话”触发：至少存在一组问答
        if (!(qCount > 0 && aCount > 0 && total >= 2)) {
            // 若页面还在加载结构，做有限重试
            if (retry < 6) {
                setTimeout(() => maybeRunQwenInitialScrollUnlock(retry + 1), 350);
            }
            return;
        }

        const scrollEl = getScrollContainer();
        if (!scrollEl) {
            if (retry < 6) {
                setTimeout(() => maybeRunQwenInitialScrollUnlock(retry + 1), 350);
            }
            return;
        }

        qwenInitUnlockInProgress = true;

        const shift = Math.max(120, Math.floor(window.innerHeight * 0.4));
        try {
            if (scrollEl !== window && typeof scrollEl.scrollBy === 'function') {
                const maxTop = Math.max(0, (scrollEl.scrollHeight || 0) - (scrollEl.clientHeight || 0));
                const startTop = Math.max(0, scrollEl.scrollTop || 0);
                const upTop = Math.max(0, startTop - shift);
                scrollEl.scrollTo({ top: upTop, behavior: 'auto' });
                setTimeout(() => {
                    scrollEl.scrollTo({ top: maxTop, behavior: 'auto' });
                    sessionStorage.setItem(doneKey, '1');
                    qwenInitUnlockInProgress = false;
                }, 180);
            } else {
                const root = document.documentElement;
                const pageH = Math.max(root.scrollHeight || 0, document.body ? document.body.scrollHeight : 0);
                const maxTop = Math.max(0, pageH - (window.innerHeight || 0));
                const startTop = Math.max(root.scrollTop || 0, window.scrollY || 0);
                const upTop = Math.max(0, startTop - shift);
                window.scrollTo({ top: upTop, behavior: 'auto' });
                setTimeout(() => {
                    window.scrollTo({ top: maxTop, behavior: 'auto' });
                    sessionStorage.setItem(doneKey, '1');
                    qwenInitUnlockInProgress = false;
                }, 180);
            }
        } catch (e) {
            qwenInitUnlockInProgress = false;
            console.warn('AI-Chat-Nodes: 千问初始滚动解锁失败', e);
        }
    }

    /**
     * 非 ChatGPT 平台：加载全部历史消息节点
     * 策略：持续向上滚动直到 scrollTop 稳定为 0（真正到顶），然后刷新全部节点
     * @param {HTMLElement} triggerBtn - 可选触发按钮（用于显示进度状态）
     */
    function startLoadAllHistory(triggerBtn = null) {
        return new Promise((resolve) => {
            // 用户要求的缓存机制：如果已经加载过全量历史，直接跳过并完成
            if (isHistoryFullyLoaded) {
                console.log('AI-Chat-Nodes: 历史已加载过，直接开启导出。');
                resolve();
                return;
            }

            const scrollEl = getScrollContainer();
            if (!scrollEl || scrollEl === window) {
                console.warn('AI-Chat-Nodes: 未能找到滚动容器，无法自动加载历史。');
                resolve();
                return;
            }

            let stableZeroCount = 0;
            let lastScrollTop = -1;
            let tickCount = 0;
            const MAX_TICKS = 60; // 安全上限
            const STABLE_ZERO_TARGET = 3;
            const initialScrollTop = Math.max(1, scrollEl.scrollTop || 1);
            let maxSeenMessageCount = getApproxLoadedMessageCount();

            let originalBtnText = '';
            if (triggerBtn) {
                originalBtnText = triggerBtn.textContent || '加载全部历史';
                triggerBtn.disabled = true;
                triggerBtn.style.opacity = '0.7';
                triggerBtn.style.cursor = 'not-allowed';
            }

            const toast = document.createElement('div');
            toast.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(30, 30, 40, 0.92);color:#fff;font-size:13px;padding:14px 28px;border-radius:30px;z-index:20000;display:flex;align-items:center;gap:12px;backdrop-filter:blur(10px);box-shadow:0 10px 40px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);transition:opacity 0.3s;`;
            toast.innerHTML = `<i class="fas fa-history fa-spin" style="color:#4dabf7;"></i><div style="min-width:340px;"><div id="load-all-toast-msg">准备导出：正在回溯历史记录...</div><div style="margin-top:8px;height:6px;background:rgba(255,255,255,0.18);border-radius:99px;overflow:hidden;"><div id="load-all-toast-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#4dabf7,#74c0fc);transition:width .25s ease;"></div></div><div id="load-all-toast-sub" style="margin-top:6px;font-size:12px;color:rgba(255,255,255,.75);">轮次: 0 / ${MAX_TICKS} · 已识别消息: 0 · 到顶确认: 0/${STABLE_ZERO_TARGET}</div></div>`;
            document.body.appendChild(toast);

            const toastMsg = toast.querySelector('#load-all-toast-msg');
            const toastBar = toast.querySelector('#load-all-toast-bar');
            const toastSub = toast.querySelector('#load-all-toast-sub');

            const intervalId = setInterval(() => {
                tickCount++;
                const currentScrollTop = scrollEl.scrollTop;
                const approxMsgCount = getApproxLoadedMessageCount();
                maxSeenMessageCount = Math.max(maxSeenMessageCount, approxMsgCount);

                const consumedRatio = 1 - (Math.max(currentScrollTop, 0) / initialScrollTop);
                const consumedProgress = Math.min(96, Math.max(0, Math.round(consumedRatio * 100)));

                if (toastMsg) {
                    toastMsg.innerText = `正在回溯历史记录（${AI_NAME}）：${consumedProgress}%`;
                }
                if (toastBar) {
                    toastBar.style.width = `${consumedProgress}%`;
                }
                if (toastSub) {
                    toastSub.innerText = `轮次: ${tickCount} / ${MAX_TICKS} · 已识别消息: ${maxSeenMessageCount} · 到顶确认: ${stableZeroCount}/${STABLE_ZERO_TARGET}`;
                }
                if (triggerBtn) {
                    triggerBtn.textContent = `加载中 ${consumedProgress}%`;
                }

                if (tickCount > MAX_TICKS) { finish(); return; }

                if (currentScrollTop === 0 && lastScrollTop === 0) {
                    stableZeroCount++;
                    if (stableZeroCount >= STABLE_ZERO_TARGET) { finish(); return; }
                } else {
                    stableZeroCount = 0;
                }

                lastScrollTop = currentScrollTop;
                scrollEl.scrollTop = 0;
                setTimeout(() => scrollEl.scrollTo({ top: 0, behavior: 'smooth' }), 50);
            }, 1200); // 提速到 1.2s 一次检测

            function finish() {
                clearInterval(intervalId);
                isHistoryFullyLoaded = true; // 标记历史已全量加载
                if (toastMsg) {
                    toastMsg.style.color = '#51cf66';
                    toastMsg.innerHTML = '<i class="fas fa-check" style="color:#51cf66;"></i> 对话数据准备就绪';
                }
                if (toastBar) {
                    toastBar.style.width = '100%';
                    toastBar.style.background = 'linear-gradient(90deg,#51cf66,#69db7c)';
                }
                if (toastSub) {
                    toastSub.style.color = 'rgba(166, 255, 189, 0.9)';
                    toastSub.innerText = `完成：累计识别消息 ${maxSeenMessageCount} 条`;
                }
                if (triggerBtn) {
                    triggerBtn.textContent = '已完成';
                }
                
                setTimeout(() => {
                    try {
                        update();
                        // 遵照用户需求：不再复位，直接滚到最新对话
                        scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'instant' });
                    } catch (e) {
                        console.error('AI-Chat-Nodes: update error', e);
                    } finally {
                        if (triggerBtn) {
                            triggerBtn.disabled = false;
                            triggerBtn.style.opacity = '1';
                            triggerBtn.style.cursor = 'pointer';
                            triggerBtn.textContent = originalBtnText || '加载全部历史';
                        }
                        toast.style.opacity = '0';
                        setTimeout(() => {
                            if (toast.isConnected) toast.remove();
                            resolve(); 
                        }, 300);
                    }
                }, 500);
            }
        });
    }


    function render() {
        dotsLayer.innerHTML = '';

        if (!nodes.length) {
            track.style.top = '0';
            track.style.height = '100%';
            content.style.height = '100%';
            return;
        }

        const viewportHeight = scrollArea.clientHeight || (window.innerHeight - CONFIG.topGap - CONFIG.bottomGap);
        const requiredHeight = (nodes.length - 1) * CONFIG.dotGap + CONFIG.dotSize + 24;
        const useScrollMode = requiredHeight > viewportHeight;

        let contentHeight;
        let topPositions = [];

        if (nodes.length <= 1) {
            contentHeight = viewportHeight;
            topPositions = nodes.length === 1 ? [viewportHeight / 2] : [];
        } else if (useScrollMode) {
            contentHeight = requiredHeight;
            for (let i = 0; i < nodes.length; i++) {
                topPositions.push(12 + CONFIG.dotSize / 2 + i * CONFIG.dotGap);
            }
        } else {
            contentHeight = viewportHeight;
            const start = 12 + CONFIG.dotSize / 2;
            const end = viewportHeight - 12 - CONFIG.dotSize / 2;
            const step = (end - start) / (nodes.length - 1);

            for (let i = 0; i < nodes.length; i++) {
                topPositions.push(start + i * step);
            }
        }

        content.style.height = contentHeight + 'px';
        dotsLayer.style.height = contentHeight + 'px';

        track.style.top = '12px';
        track.style.height = Math.max(0, contentHeight - 24) + 'px';

        nodes.forEach((node, index) => {
            const dot = buildDot(node, topPositions[index]);
            node.dot = dot;
            dotsLayer.appendChild(dot);
            
            // 重要：如果是当前激活节点，重新渲染时立即恢复样式
            if (node.id === activeNodeId) {
                setActiveDot(dot, node.id);
            }
        });
        
        // 渲染结束后尝试立即同步一次激活状态
        updateActiveNodeOnScroll();
    }

    function update() {
        if (updateStorageKey()) {
            console.log('AI-Chat-Nodes: Conversation switched, reloading...');
            nodes = [];
            nodesMap.clear();
            init(true);
            return;
        }

        const currentBatch = getMessages();
        if (currentBatch.length === 0) return;

        // ====================================================
        // 所有平台通用路径 (优化版)
        // ====================================================
        let hasNew = false;

        // 1. 更新现有节点的元素引用
        currentBatch.forEach(msg => {
            if (nodesMap.has(msg.id)) {
                nodesMap.get(msg.id).element = msg.element;
            }
        });

        // 2. 插入新发现的节点
        currentBatch.forEach((msg, batchIdx) => {
            if (!nodesMap.has(msg.id)) {
                msg.isHistory = false;
                nodesMap.set(msg.id, msg);
                hasNew = true;

                let insertedIndex = -1;

                // 2.1 尝试在当前批次中寻找最近的邻居
                for (let i = batchIdx + 1; i < currentBatch.length; i++) {
                    const later = currentBatch[i];
                    if (nodesMap.get(later.id)?.isLinked) {
                        const idx = nodes.findIndex(n => n.id === later.id);
                        if (idx !== -1) { insertedIndex = idx; break; }
                    }
                }
                if (insertedIndex === -1) {
                    for (let i = batchIdx - 1; i >= 0; i--) {
                        const earlier = currentBatch[i];
                        if (nodesMap.get(earlier.id)?.isLinked) {
                            const idx = nodes.findIndex(n => n.id === earlier.id);
                            if (idx !== -1) { insertedIndex = idx + 1; break; }
                        }
                    }
                }
                
                // 2.2 如果在批次内没找到已链接邻居，则遍历 nodes 使用 compareDocumentPosition 物理定位
                if (insertedIndex === -1) {
                    for (let i = 0; i < nodes.length; i++) {
                        const existing = nodes[i];
                        if (existing.element && document.body.contains(existing.element)) {
                            const pos = msg.element.compareDocumentPosition(existing.element);
                            if (pos & Node.DOCUMENT_POSITION_FOLLOWING) { 
                                insertedIndex = i; 
                                break; 
                            }
                        }
                    }
                }

                // 2.3 边界情况处理：如果仍然没找到（通常是在列表两端且邻居不在 DOM 中）
                if (insertedIndex === -1 && nodes.length > 0) {
                    const rect = msg.element.getBoundingClientRect();
                    // 如果消息在视口上方较远，大概率是加载的历史消息，插入到首部
                    if (rect.top < 200) insertedIndex = 0;
                    // 否则插入到末尾
                    else insertedIndex = nodes.length;
                }
                
                if (insertedIndex === -1) insertedIndex = nodes.length;

                msg.isLinked = true;
                nodes.splice(insertedIndex, 0, msg);
            } else {
                nodesMap.get(msg.id).isLinked = true;
            }
        });


        const reordered = sortNodesByDom();

        if (hasNew || reordered) {
            const cacheData = nodes.map(n => ({ id: n.id, text: n.text, role: n.role }));
            localStorage.setItem(storageKey, JSON.stringify(cacheData));
            render();
            updateActiveNodeOnScroll();
        }

    }
    function sortNodesByDom() {
        // 筛选出当前存在于 DOM 中的节点
        const domNodes = nodes.filter(n => {
            const el = n.element;
            return el && document.body.contains(el);
        });
        
        if (domNodes.length < 2) return false;

        // 获取这些节点的正确物理顺序
        const sortedDomNodes = [...domNodes].sort((a, b) => {
            const pos = a.element.compareDocumentPosition(b.element);
            if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
            if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
            return 0;
        });

        // 比较当前顺序是否正确
        let changed = false;
        let visibleIndices = domNodes.map(n => nodes.indexOf(n)).sort((a, b) => a - b);
        
        for (let i = 0; i < domNodes.length; i++) {
            if (domNodes[i].id !== sortedDomNodes[i].id) {
                changed = true;
                break;
            }
        }

        if (changed) {
            // 将排序后的节点填回原本的位置，保持与非 DOM 节点的相对关系
            sortedDomNodes.forEach((node, i) => {
                nodes[visibleIndices[i]] = node;
            });
            return true;
        }
        return false;
    }

    // 初始化：尝试读取缓存
    function init(forceOrder = false) {
        if (isDeepSeek) {
            installDeepSeekCaptureHooks();
        }
        try {
            const cachedArr = JSON.parse(localStorage.getItem(storageKey));
            if (cachedArr && Array.isArray(cachedArr)) {
                cachedArr.forEach(m => {
                    m.isHistory = true; 
                    m.isLinked = true; // 缓存的节点默认已链接
                    nodesMap.set(m.id, m);
                });
                nodes = cachedArr;
                render();
            }
        } catch (e) {
            console.error('Failed to load nodes cache', e);
        }
        
        setTimeout(update, 1000);
        if (isQwen) {
            setTimeout(() => maybeRunQwenInitialScrollUnlock(), 1200);
        }
        if (isDeepSeek) {
            setTimeout(() => scheduleDeepSeekVirtualNodesRefresh(true), 1200);
        }
    }

    const observer = new MutationObserver(() => {
        if (ticking) return;
        ticking = true;

        requestAnimationFrame(() => {
            update();
            ticking = false;
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    window.addEventListener('resize', () => {
        render();
    });

    // ===== 自动滚动跟踪 =====
    let scrollTicking = false;
    window.addEventListener('scroll', () => {
        if (scrollTicking) return;
        scrollTicking = true;
        requestAnimationFrame(() => {
            updateActiveNodeOnScroll();
            scrollTicking = false;
        });
    }, true); // 使用捕获模式，捕获内部容器的滚动事件

    function updateActiveNodeOnScroll() {
        if (!nodes.length) return;
        const scrollEl = getScrollContainer();
        if (!scrollEl) return;

        if (isQwen) {
            const node = getQwenActiveNodeByConversationState(scrollEl);
            if (node && node.id !== activeNodeId) {
                setActiveDot(node.dot, node.id);
                scrollDotIntoView(node.dot);
            }
            return;
        }

        // 1. 底部吸附判断：如果已经滚到底部，直接激活最后一个节点
        const isAtBottom = (scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight) < 50;
        if (isAtBottom) {
            const lastNode = nodes[nodes.length - 1];
            if (lastNode && lastNode.id !== activeNodeId) {
                setActiveDot(lastNode.dot, lastNode.id);
                scrollDotIntoView(lastNode.dot);
            }
            return;
        }

        // 2. 常规位置判定
        let bestNode = null;
        let minDist = Infinity;
        const VIEWPORT_ANCHOR = 150; // 视口黄金分割锚点
        
        nodes.forEach(node => {
            if (!node.element || !node.element.isConnected) return;
            const rect = node.element.getBoundingClientRect();
            
            // 只要消息或其回复在视野内，就参与计算距离
            if (rect.bottom > 0 && rect.top < window.innerHeight) {
                const dist = Math.abs(rect.top - VIEWPORT_ANCHOR); 
                if (dist < minDist) {
                    minDist = dist;
                    bestNode = node;
                }
            }
        });
        
        if (bestNode && bestNode.id !== activeNodeId) {
            setActiveDot(bestNode.dot, bestNode.id);
            scrollDotIntoView(bestNode.dot);
        }
    }

    // ===== 设置按钮与弹出层 =====
    function injectSettings() {
        // 使用全局变量 host, isQwen, isChatGPT, isDoubao, isDeepSeek
        const aiName = isChatGPT ? 'ChatGPT' : (isDeepSeek ? 'DeepSeek' : (isDoubao ? '豆包' : '通义千问'));

        if (isQwen) {
            try {
                installQwenCaptureHooks();
            } catch (e) {
                console.warn('AI-Chat-Nodes: 千问抓包钩子初始化失败，不影响设置按钮注入', e);
            }
        }

        if (isDoubao) {
            try {
                installDoubaoCaptureHooks();
            } catch (e) {
                console.warn('AI-Chat-Nodes: 豆包抓包钩子初始化失败，不影响设置按钮注入', e);
            }
        }

        // 注入 FontAwesome

        // 注入 FontAwesome
        if (!document.getElementById('ai-nodes-fa')) {
            const fa = document.createElement('link');
            fa.id = 'ai-nodes-fa';
            fa.rel = 'stylesheet';
            fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css';
            document.head.appendChild(fa);
        }

        // 创建按钮
        const btn = document.createElement('button');
        btn.className = 'ai-nodes-settings-btn' + (isDeepSeek ? ' ds-icon-button ds-icon-button--l ds-icon-button--s ds-icon-button--sizing-container' : '');
        // 使用 SVG 代替 FontAwesome 字体，以绕过 ChatGPT 严格的 CSP（防止字体库加载失败）
        btn.innerHTML = `
            <svg width="22" height="22" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="48" height="48" fill="white" fill-opacity="0.01"></rect>
                <path d="M18.2838 43.1712C14.9327 42.1735 11.9498 40.3212 9.58787 37.8669C10.469 36.8226 11 35.4733 11 34C11 30.6863 8.31371 28 5 28C4.79955 28 4.60139 28.0098 4.40599 28.029C4.13979 26.7276 4 25.3801 4 24C4 21.9094 4.32077 19.8937 4.91579 17.9994C4.94381 17.9998 4.97188 18 5 18C8.31371 18 11 15.3137 11 12C11 11.0487 10.7786 10.1491 10.3846 9.34999C12.6975 7.19937 15.5205 5.5899 18.6521 4.72302C19.6444 6.66807 21.6667 8.00001 24 8.00001C26.3333 8.00001 28.3556 6.66807 29.3479 4.72302C32.4795 5.5899 35.3025 7.19937 37.6154 9.34999C37.2214 10.1491 37 11.0487 37 12C37 15.3137 39.6863 18 43 18C43.0281 18 43.0562 17.9998 43.0842 17.9994C43.6792 19.8937 44 21.9094 44 24C44 25.3801 43.8602 26.7276 43.594 28.029C43.3986 28.0098 43.2005 28 43 28C39.6863 28 37 30.6863 37 34C37 35.4733 37.531 36.8226 38.4121 37.8669C36.0502 40.3212 33.0673 42.1735 29.7162 43.1712C28.9428 40.7518 26.676 39 24 39C21.324 39 19.0572 40.7518 18.2838 43.1712Z" fill="#2F88FF" stroke="#333" stroke-width="3" stroke-linejoin="round"></path>
                <path d="M24 31C27.866 31 31 27.866 31 24C31 20.134 27.866 17 24 17C20.134 17 17 20.134 17 24C17 27.866 20.134 31 24 31Z" fill="#43CCF8" stroke="white" stroke-width="3" stroke-linejoin="round"></path>
            </svg>
        `;
        btn.title = 'AI 节点设置';
        btn.style.cssText = `
            background: transparent;
            border: none;
            cursor: pointer;
            color: #888;
            padding: 0;
            margin: 0;
            width: 32px;
            height: 32px;
            transition: color 0.2s, transform 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            outline: none;
            flex-shrink: 0;
            z-index: 100;
            background-clip: padding-box;
        `;
        btn.addEventListener('mouseenter', () => {
            btn.style.color = '#555';
            btn.style.transform = 'rotate(30deg)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.color = '#888';
            btn.style.transform = 'rotate(0)';
        });

        // 创建弹出气泡 (Popup)
        const popup = document.createElement('div');
        popup.className = 'ai-nodes-settings-popup';
        popup.style.cssText = `
            position: fixed;
            background: rgba(255, 255, 255, 0.98);
            border: 1px solid rgba(0, 0, 0, 0.08);
            border-radius: 12px;
            padding: 16px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
            width: 220px;
            z-index: 10001;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s, transform 0.2s;
            transform: translateY(10px) scale(0.95);
            backdrop-filter: blur(10px);
        `;
        popup.innerHTML = `
            <div style="font-weight: 600; font-size: 14px; margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom: 8px;"> AI 聊天节点设置 </div>
            <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #666;">
                <i class="fas fa-robot" style="color: #46a758;"></i>
                <span>当前 AI 平台: <b>${aiName}</b></span>
            </div>
            ${isQwen ? `
                <div style="margin-top: 12px; padding-top: 8px; border-top: 1px dashed #eee; display: flex; flex-direction: column; gap: 8px;">
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                        <input type="checkbox" id="ai-nodes-opt-collapse" ${autoCollapse ? 'checked' : ''} style="cursor: pointer; width: 14px; height: 14px;">
                        <span>自动收起千问侧边栏</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; cursor: pointer;">
                        <input type="checkbox" id="ai-nodes-opt-ads" ${removeAds ? 'checked' : ''} style="cursor: pointer; width: 14px; height: 14px;">
                        <span>移除千问推荐广告</span>
                    </label>
                </div>
            ` : ''}

            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #eee; display: flex; flex-direction: column; gap: 8px;">
                <button id="ai-nodes-clear-refresh" style="width: 100%; border: 1px solid #ff4d4f; background: #fff; color: #ff4d4f; padding: 6px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.2s;">
                    <i class="fas fa-redo-alt" style="margin-right: 4px;"></i> 清除节点缓存重新获取
                </button>
                
                <button id="ai-nodes-export-trigger" style="width: 100%; padding: 10px; background: #1E88E5; color: white; border: none; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; box-shadow: 0 4px 10px rgba(30, 136, 229, 0.2);">
                    <svg width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/><path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/></svg>
                    <span>导出当前对话</span>
                </button>
            </div>
        `;
        document.body.appendChild(popup);

        // 核心修复：阻止弹出层内部点击事件冒泡到 document，防止点击开关时关闭卡片
        popup.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        // 监听设置项变化


        if (isQwen) {
            popup.querySelector('#ai-nodes-opt-collapse').addEventListener('change', (e) => {
                autoCollapse = e.target.checked;
                localStorage.setItem(COLLAPSE_KEY, autoCollapse);
                if (autoCollapse) applyAutoCollapse();
            });

            popup.querySelector('#ai-nodes-opt-ads').addEventListener('change', (e) => {
                removeAds = e.target.checked;
                localStorage.setItem(ADS_KEY, removeAds);
                if (removeAds) document.body.classList.add('ai-nodes-hide-ads');
                else document.body.classList.remove('ai-nodes-hide-ads');
            });

            // 加载全部历史节点按鈕
            const loadAllBtn = popup.querySelector('#ai-nodes-load-all');
            if (loadAllBtn) {
                loadAllBtn.onclick = (e) => {
                    e.stopPropagation();
                    // 关闭弹窗
                    popup.style.opacity = '0';
                    popup.style.pointerEvents = 'none';
                    popup.style.transform = 'translateY(10px) scale(0.95)';
                    startLoadAllHistory(loadAllBtn);
                };
            }
        }

        // 强制清除缓存重新获取按钮
        const clearBtn = popup.querySelector('#ai-nodes-clear-refresh');
        if (clearBtn) {
            clearBtn.onclick = (e) => {
                e.stopPropagation();
                // 清掉内存和持久化存储
                nodesMap.clear();
                nodes = [];
                lastCount = 0;
                localStorage.removeItem(storageKey);
                // 清掉侧边栏 DOM
                const wrapper = document.querySelector('#ai-nodes-nav-wrapper');
                if (wrapper) wrapper.innerHTML = '';
                // 触发重新获取
                update();
                render(); // 核心修复：强制重新渲染圆点
                // 关闭弹窗
                popup.style.opacity = '0';
                popup.style.pointerEvents = 'none';
                popup.style.transform = 'translateY(10px) scale(0.95)';
            };
        }

        // 绑定管理导出点击事件
        popup.querySelector('#ai-nodes-export-trigger').onclick = async (e) => {
            e.stopPropagation();
            popup.style.opacity = '0';
            popup.style.pointerEvents = 'none';
            // GPT、豆包、千问、DeepSeek 导出不走导出前回溯历史
            if (!isChatGPT && !isDoubao && !isQwen && !isDeepSeek) {
                await startLoadAllHistory();
            }
            await openExportModal();
        };

        function getChatGPTConversationIdFromUrl() {
            const m = window.location.pathname.match(/\/c\/([a-z0-9-]+)/i);
            return m ? m[1] : '';
        }

        async function getChatGPTAccessToken() {
            try {
                const sessionResp = await fetch('/api/auth/session?unstable_client=true');
                if (!sessionResp.ok) return null;
                const session = await sessionResp.json();
                return session?.accessToken || null;
            } catch (e) {
                console.warn('AI-Chat-Nodes: 获取 ChatGPT access token 失败', e);
                return null;
            }
        }

        function cleanChatGPTText(text) {
            if (!text) return '';
            return text
                .replace(/\uE200cite(?:\uE202turn\d+(?:search|view)\d+)+\uE201/gi, '')
                .replace(/cite(?:turn\d+(?:search|view)\d+)+/gi, '')
                .trim();
        }

        function escapeHtml(str) {
            return String(str || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        function chatMarkdownToHtml(mdText) {
            if (!mdText) return '';

            const codeBlocks = [];
            const codePlaceholder = '__AI_CHAT_CODE_BLOCK__';

            let html = escapeHtml(mdText).replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_, lang, code) => {
                const langLabel = (lang || '').trim();
                const block = `<pre><code class="lang-${langLabel}">${code}</code></pre>`;
                codeBlocks.push(block);
                return `${codePlaceholder}${codeBlocks.length - 1}__`;
            });

            html = html
                .replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
                .replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
                .replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')
                .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
                .replace(/(^|[^`])`([^`]+)`/g, '$1<code>$2</code>')
                .replace(/\n/g, '<br>');

            html = html.replace(new RegExp(`${codePlaceholder}(\\d+)__`, 'g'), (_, idx) => codeBlocks[Number(idx)] || '');
            return html;
        }

        function partToMarkdown(part) {
            if (part == null) return '';
            if (typeof part === 'string') return part;
            if (Array.isArray(part)) {
                return part.map(p => partToMarkdown(p)).filter(Boolean).join('\n');
            }
            if (typeof part !== 'object') return String(part);

            const partType = part.content_type || part.type || '';
            const lang = (part.language || part.lang || '').trim();
            const rawText = typeof part.text === 'string'
                ? part.text
                : (typeof part.content === 'string' ? part.content : '');

            if (partType === 'code' || partType === 'program' || (lang && rawText)) {
                return `\n\`\`\`${lang}\n${rawText}\n\`\`\`\n`;
            }

            if (partType === 'image' || partType === 'image_asset_pointer') {
                return '[图片内容已省略]';
            }

            const nestedCandidates = [
                part.parts,
                part.items,
                part.content,
                part.output,
                part.result,
                part.children,
                part.data
            ];

            const nested = nestedCandidates
                .map(item => partToMarkdown(item))
                .filter(Boolean)
                .join('\n')
                .trim();

            if (rawText && nested) return `${rawText}\n${nested}`;
            return rawText || nested || '';
        }

        function extractChatGPTMessageText(msg) {
            const content = msg?.content;
            if (!content) return '';

            if (typeof content === 'string') return cleanChatGPTText(content);

            let raw = '';
            if (Array.isArray(content.parts) && content.parts.length) {
                raw = partToMarkdown(content.parts);
            } else if (typeof content.text === 'string') {
                raw = content.text;
            } else if (Array.isArray(content.items) && content.items.length) {
                raw = partToMarkdown(content.items);
            } else if (content.output) {
                raw = partToMarkdown(content.output);
            } else if (content.result) {
                raw = partToMarkdown(content.result);
            } else if (content.content) {
                raw = partToMarkdown(content.content);
            } else {
                raw = partToMarkdown(content);
            }

            return cleanChatGPTText(String(raw).replace(/\n{3,}/g, '\n\n'));
        }

        function extractChatGPTMessagesFromMapping(convData) {
            const mapping = convData?.mapping;
            if (!mapping) return [];

            const messages = [];
            const keys = Object.keys(mapping);

            const pushMessageFromNode = (node) => {
                if (!node || !node.message) return;
                const msg = node.message;
                const author = msg.author?.role;
                const isHidden = msg.metadata?.is_visually_hidden_from_conversation ||
                    msg.metadata?.is_contextual_answers_system_message;

                if ((author !== 'user' && author !== 'assistant') || isHidden) return;

                const text = extractChatGPTMessageText(msg);
                if (!text) return;

                messages.push({
                    role: author,
                    text,
                    html: chatMarkdownToHtml(text),
                    createTime: msg.create_time || 0
                });
            };

            // 优先仅提取当前生效分支，避免把重试/分叉分支混入导出
            const currentNodeId = convData?.current_node;
            if (currentNodeId && mapping[currentNodeId]) {
                const activePath = [];
                let cursor = currentNodeId;
                const guard = new Set();

                while (cursor && mapping[cursor] && !guard.has(cursor)) {
                    guard.add(cursor);
                    activePath.unshift(cursor);
                    cursor = mapping[cursor]?.parent;
                }

                activePath.forEach(nodeId => pushMessageFromNode(mapping[nodeId]));
            } else {
                // 兜底：从根节点 DFS，兼容特殊历史数据
                const rootId = mapping['client-created-root']
                    ? 'client-created-root'
                    : keys.find(id => !mapping[id]?.parent) || keys[0];
                const visited = new Set();

                const walk = (nodeId) => {
                    if (!nodeId || visited.has(nodeId)) return;
                    visited.add(nodeId);

                    const node = mapping[nodeId];
                    if (!node) return;

                    pushMessageFromNode(node);

                    if (Array.isArray(node.children)) {
                        node.children.forEach(childId => walk(childId));
                    }
                };

                walk(rootId);
            }

            messages.sort((a, b) => (a.createTime || 0) - (b.createTime || 0));
            messages.forEach(m => delete m.createTime);
            return messages;
        }

        async function getChatGPTMessagesByApi() {
            const convId = getChatGPTConversationIdFromUrl();
            if (!convId) return [];

            const token = await getChatGPTAccessToken();
            if (!token) return [];

            try {
                const resp = await fetch(`/backend-api/conversation/${convId}`, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                if (!resp.ok) {
                    console.warn(`AI-Chat-Nodes: ChatGPT 会话 API 请求失败 (${resp.status})`);
                    return [];
                }

                const convData = await resp.json();
                return extractChatGPTMessagesFromMapping(convData);
            } catch (e) {
                console.warn('AI-Chat-Nodes: ChatGPT 会话 API 解析失败', e);
                return [];
            }
        }

        const QWEN_MSG_LIST_PATH = '/api/v1/session/msg/list';
        const QWEN_DEFAULT_MSG_LIST_URL = 'https://chat2-api.qianwen.com/api/v1/session/msg/list?return_response_messages=true&biz_id=ai_qwen&event_filter=all&page_size=50&chat_client=h5&device=pc&fr=pc&pr=qwen&la=zh-CN&tz=Asia%2FShanghai';
        let qwenCapturedTemplate = null;
        let qwenCaptureHooksInstalled = false;

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
                if (obj[k] != null && obj[k] !== '') return String(obj[k]);
            }
            return '';
        }

        function getQwenSessionIdFromUrl() {
            try {
                const url = new URL(window.location.href);
                const q = url.searchParams.get('session_id');
                if (q) return q;

                const m1 = url.pathname.match(/\/chat\/([a-zA-Z0-9_-]{16,})/);
                if (m1) return m1[1];

                const m2 = url.pathname.match(/\/session\/([a-zA-Z0-9_-]{16,})/);
                if (m2) return m2[1];
            } catch (e) {
                // ignore
            }
            return '';
        }

        function getQwenSessionIdFromTemplate() {
            try {
                if (!qwenCapturedTemplate?.url) return '';
                const u = new URL(qwenCapturedTemplate.url, window.location.origin);
                const sid = (u.searchParams.get('session_id') || '').trim();
                return sid;
            } catch (e) {
                return '';
            }
        }

        function getRecentQwenMsgListUrl() {
            try {
                const entries = performance.getEntriesByType('resource') || [];
                for (let i = entries.length - 1; i >= 0; i--) {
                    const name = entries[i] && entries[i].name ? String(entries[i].name) : '';
                    if (/\/api\/v1\/session\/msg\/list\?/i.test(name) && /(qianwen\.com|aliyun\.com)/i.test(name)) {
                        return name;
                    }
                }
            } catch (e) {
                // ignore
            }
            return '';
        }

        function getQwenSessionIdFromRecentApi() {
            try {
                const recentUrl = getRecentQwenMsgListUrl();
                if (!recentUrl) return '';
                const u = new URL(recentUrl, window.location.origin);
                return (u.searchParams.get('session_id') || '').trim();
            } catch (e) {
                return '';
            }
        }

        function getQwenSessionIdFromStorage() {
            const keys = [
                'session_id', 'current_session_id', 'qwen_session_id', 'active_session_id'
            ];
            for (const k of keys) {
                const v1 = localStorage.getItem(k);
                if (v1) return String(v1).trim();
                const v2 = sessionStorage.getItem(k);
                if (v2) return String(v2).trim();
            }
            return '';
        }

        function getQwenSessionIdFromRawUrl(rawUrl) {
            try {
                if (!rawUrl) return '';
                const u = new URL(rawUrl, window.location.origin);
                return (u.searchParams.get('session_id') || '').trim();
            } catch (e) {
                return '';
            }
        }

        function getQwenSessionIdFromHash() {
            try {
                const h = window.location.hash || '';
                const m = h.match(/session[_/-]?id=([a-zA-Z0-9_-]{16,})/i)
                    || h.match(/\/chat\/([a-zA-Z0-9_-]{16,})/i)
                    || h.match(/\/session\/([a-zA-Z0-9_-]{16,})/i);
                return m ? m[1] : '';
            } catch (e) {
                return '';
            }
        }

        function getQwenSessionIdFromConvFallback() {
            try {
                const convId = String(getConvId() || '').trim();
                if (!convId || convId === 'default') return '';
                if (/^[a-zA-Z0-9_-]{16,}$/.test(convId)) return convId;
            } catch (e) {
                // ignore
            }
            return '';
        }

        function getQwenSessionIdCandidates() {
            const candidates = [
                getQwenSessionIdFromUrl(),
                getQwenSessionIdFromTemplate(),
                getQwenSessionIdFromRecentApi(),
                getQwenSessionIdFromHash(),
                getQwenSessionIdFromConvFallback(),
                getQwenSessionIdFromStorage()
            ].map(v => String(v || '').trim()).filter(Boolean);
            return Array.from(new Set(candidates));
        }

        function getQwenSessionId() {
            const candidates = getQwenSessionIdCandidates();
            return candidates[0] || '';
        }

        function getQwenUtFromPage() {
            try {
                if (qwenCapturedTemplate?.url) {
                    const u = new URL(qwenCapturedTemplate.url, window.location.origin);
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
                const u = new URL(rawUrl, window.location.origin);
                return u.pathname.includes(QWEN_MSG_LIST_PATH);
            } catch (e) {
                return false;
            }
        }

        function sanitizeQwenHeaders(headersObj) {
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
                if (v == null || v === '') return;
                out[key] = String(v);
            });

            if (!out.accept) out.accept = 'application/json, text/plain, */*';
            return out;
        }

        function ensureQwenRequestUrl(rawUrl, sessionId) {
            const base = rawUrl || qwenCapturedTemplate?.url || QWEN_DEFAULT_MSG_LIST_URL;
            const u = new URL(base, window.location.origin);

            if (!u.pathname.includes(QWEN_MSG_LIST_PATH)) {
                u.hostname = 'chat2-api.qianwen.com';
                u.pathname = QWEN_MSG_LIST_PATH;
            }

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

            const ut = getQwenUtFromPage();
            if (ut && !u.searchParams.get('ut')) u.searchParams.set('ut', ut);

            u.searchParams.set('nonce', createNonce(11));
            u.searchParams.set('timestamp', String(Date.now()));
            return u.toString();
        }

        function getQwenRequestUrlCandidates() {
            const out = [];
            if (qwenCapturedTemplate?.url) out.push(qwenCapturedTemplate.url);
            const recent = getRecentQwenMsgListUrl();
            if (recent) out.push(recent);
            out.push(QWEN_DEFAULT_MSG_LIST_URL);
            return Array.from(new Set(out));
        }

        function normalizeQwenMessageText(text) {
            const t = String(text || '').trim();
            if (!t) return '';
            // 去掉千问内部思考块标签前缀，如 [(multimodal_chat_think_1)]
            return t.replace(/^\[\([^)]+\)\]\s*/g, '').trim();
        }

        function shouldIgnoreQwenMimeType(mimeType) {
            const mt = String(mimeType || '').toLowerCase();
            return mt === 'signal/post'
                || mt === 'bar/progress'
                || mt === 'bar/iframe'
                || mt === 'image/url'
                || mt === 'image_inline'
                || mt === 'ref_source_inline';
        }

        function extractQwenUserTexts(item) {
            const req = Array.isArray(item?.request_messages) ? item.request_messages : [];
            const out = [];

            req.forEach((m) => {
                const mime = String(m?.mime_type || '').toLowerCase();
                const content = normalizeQwenMessageText(m?.content || '');
                if (!content) return;
                if (mime === 'image/url') return;
                out.push(content);
            });

            return Array.from(new Set(out));
        }

        function extractQwenAssistantTexts(item) {
            const resp = Array.isArray(item?.response_messages) ? item.response_messages : [];
            const out = [];

            resp.forEach((m) => {
                const mime = String(m?.mime_type || '').toLowerCase();
                if (shouldIgnoreQwenMimeType(mime)) return;
                const content = normalizeQwenMessageText(m?.content || '');
                if (!content) return;
                out.push(content);
            });

            return Array.from(new Set(out));
        }

        function parseQwenMessagesFromResponse(respJson) {
            const arr = Array.isArray(respJson?.data?.list) ? respJson.data.list : [];
            if (!arr.length) return [];

            const out = [];
            arr.forEach((item, idx) => {
                const reqId = String(item?.req_id || item?.request_id || `qwen-req-${idx + 1}`);
                const userTexts = extractQwenUserTexts(item);
                userTexts.forEach((text, i) => {
                    out.push({ id: `${reqId}-u-${i + 1}`, role: 'user', text, order: idx * 2 + 1 });
                });

                const assistantTexts = extractQwenAssistantTexts(item);
                assistantTexts.forEach((text, i) => {
                    out.push({ id: `${reqId}-a-${i + 1}`, role: 'assistant', text, order: idx * 2 + 2 });
                });
            });

            return out.sort((a, b) => (a.order || 0) - (b.order || 0));
        }

        function captureQwenTemplate(url, method, headers, body) {
            if (!isQwenMsgListUrl(url)) return;
            qwenCapturedTemplate = {
                url,
                method: String(method || 'GET').toUpperCase(),
                headers: parseHeadersObject(headers),
                body: typeof body === 'string' ? body : (body != null ? String(body) : '')
            };
        }

        function installQwenCaptureHooks() {
            if (!isQwen || qwenCaptureHooksInstalled) return;
            qwenCaptureHooksInstalled = true;

            const nativeFetch = window.fetch;
            window.fetch = function (input, init) {
                try {
                    const url = typeof input === 'string' ? input : input?.url;
                    if (url && isQwenMsgListUrl(url)) {
                        const method = (init?.method || input?.method || 'GET').toUpperCase();
                        const headers = init?.headers || input?.headers;
                        const body = init?.body;
                        if (typeof body === 'string') {
                            captureQwenTemplate(url, method, headers, body);
                        } else if (body != null) {
                            captureQwenTemplate(url, method, headers, String(body));
                        } else {
                            captureQwenTemplate(url, method, headers, '');
                        }
                    }
                } catch (e) {
                    console.warn('AI-Chat-Nodes: 安装千问 fetch 抓包钩子时出现异常', e);
                }
                return nativeFetch.apply(this, arguments);
            };

            const nativeOpen = XMLHttpRequest.prototype.open;
            const nativeSend = XMLHttpRequest.prototype.send;
            const nativeSetHeader = XMLHttpRequest.prototype.setRequestHeader;

            XMLHttpRequest.prototype.open = function (method, url) {
                this.__aiNodesQwenMethod = String(method || 'GET').toUpperCase();
                this.__aiNodesQwenUrl = url || '';
                this.__aiNodesQwenHeaders = {};
                return nativeOpen.apply(this, arguments);
            };

            XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
                if (this.__aiNodesQwenHeaders && name) {
                    this.__aiNodesQwenHeaders[String(name)] = String(value);
                }
                return nativeSetHeader.apply(this, arguments);
            };

            XMLHttpRequest.prototype.send = function (body) {
                try {
                    if (this.__aiNodesQwenUrl && isQwenMsgListUrl(this.__aiNodesQwenUrl)) {
                        captureQwenTemplate(
                            this.__aiNodesQwenUrl,
                            this.__aiNodesQwenMethod || 'GET',
                            this.__aiNodesQwenHeaders,
                            body
                        );
                    }
                } catch (e) {
                    console.warn('AI-Chat-Nodes: 安装千问 XHR 抓包钩子时出现异常', e);
                }
                return nativeSend.apply(this, arguments);
            };
        }

        async function getQwenMessagesByApi() {
            if (!isQwen) return [];
            installQwenCaptureHooks();

            const headers = sanitizeQwenHeaders({
                ...(qwenCapturedTemplate?.headers || {}),
                accept: 'application/json, text/plain, */*'
            });

            const urlCandidates = getQwenRequestUrlCandidates();
            const sidCandidates = getQwenSessionIdCandidates();
            const sidFromTemplateUrl = getQwenSessionIdFromRawUrl(qwenCapturedTemplate?.url);
            const sidFromRecentUrl = getQwenSessionIdFromRawUrl(getRecentQwenMsgListUrl());

            if (sidFromTemplateUrl) sidCandidates.unshift(sidFromTemplateUrl);
            if (sidFromRecentUrl) sidCandidates.unshift(sidFromRecentUrl);

            const uniqueSidCandidates = Array.from(new Set(sidCandidates.filter(Boolean)));
            const requestUrls = [];

            if (uniqueSidCandidates.length) {
                urlCandidates.forEach((baseUrl) => {
                    uniqueSidCandidates.forEach((sid) => {
                        requestUrls.push(ensureQwenRequestUrl(baseUrl, sid));
                    });
                });
            }

            urlCandidates.forEach((baseUrl) => {
                const sidInBase = getQwenSessionIdFromRawUrl(baseUrl);
                if (sidInBase) requestUrls.push(ensureQwenRequestUrl(baseUrl, sidInBase));
            });

            if (!requestUrls.length) {
                requestUrls.push(ensureQwenRequestUrl(QWEN_DEFAULT_MSG_LIST_URL, ''));
            }

            const uniqueRequestUrls = Array.from(new Set(requestUrls));

            try {
                for (const reqUrl of uniqueRequestUrls) {
                    const resp = await fetch(reqUrl, {
                        method: 'GET',
                        credentials: 'include',
                        headers
                    });

                    const rawText = await resp.text();
                    if (!resp.ok) {
                        console.warn(`AI-Chat-Nodes: 千问会话 API 请求失败 (${resp.status})`, rawText.slice(0, 400));
                        continue;
                    }

                    const json = safeParseJson(rawText);
                    if (!json) {
                        console.warn('AI-Chat-Nodes: 千问会话 API 返回非 JSON 响应');
                        continue;
                    }

                    const parsed = parseQwenMessagesFromResponse(json);
                    if (parsed.length) return parsed;

                    const code = json.code != null ? json.code : json.status_code;
                    if (code != null && Number(code) !== 0) {
                        console.warn(`AI-Chat-Nodes: 千问会话 API 返回异常 code=${code}`);
                    }
                }

                console.warn('AI-Chat-Nodes: 千问导出失败，候选请求均未获取到消息');
                return [];
            } catch (e) {
                console.warn('AI-Chat-Nodes: 千问会话 API 解析失败', e);
                return [];
            }
        }

        function getDoubaoConversationIdFromUrl() {
            const m = window.location.pathname.match(/\/chat\/([0-9]+)/i);
            return m ? m[1] : '';
        }

        function genUuid() {
            if (window.crypto && typeof window.crypto.randomUUID === 'function') {
                return window.crypto.randomUUID();
            }
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : ((r & 0x3) | 0x8);
                return v.toString(16);
            });
        }

        const DOUBAO_QUERY_DEFAULTS = 'version_code=20800&language=zh&device_platform=web&aid=497858&real_aid=497858&pkg_type=release_version&device_id=7571732726702835209&pc_version=3.12.3&web_id=7572300776296236571&tea_uuid=7572300776296236571&region=CN&sys_region=CN&samantha_web=1&use-olympus-account=1';
        let doubaoCapturedTemplate = null;
        let doubaoCaptureHooksInstalled = false;
        const doubaoArtifactContentCache = new Map();

        function safeParseJson(text) {
            try {
                return JSON.parse(text);
            } catch (e) {
                return null;
            }
        }

        function isDoubaoSingleChainUrl(rawUrl) {
            try {
                const u = new URL(rawUrl, window.location.origin);
                return /\/im\/chain\/single$/i.test(u.pathname);
            } catch (e) {
                return false;
            }
        }

        function parseHeadersObject(headersLike) {
            if (!headersLike) return {};
            if (headersLike instanceof Headers) {
                const out = {};
                headersLike.forEach((v, k) => out[String(k).toLowerCase()] = String(v));
                return out;
            }
            if (Array.isArray(headersLike)) {
                const out = {};
                headersLike.forEach((pair) => {
                    if (!Array.isArray(pair) || pair.length < 2) return;
                    out[String(pair[0]).toLowerCase()] = String(pair[1]);
                });
                return out;
            }
            if (typeof headersLike === 'object') {
                const out = {};
                Object.entries(headersLike).forEach(([k, v]) => {
                    out[String(k).toLowerCase()] = String(v);
                });
                return out;
            }
            return {};
        }

        function sanitizeDoubaoHeaders(inputHeaders) {
            const blocked = new Set([
                'cookie', 'host', 'origin', 'referer', 'content-length',
                'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest',
                'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
                'accept-encoding', 'connection'
            ]);

            const out = {};
            Object.entries(inputHeaders || {}).forEach(([k, v]) => {
                const key = String(k).toLowerCase();
                if (blocked.has(key)) return;
                if (v == null || v === '') return;
                out[key] = String(v);
            });

            if (!out.accept) out.accept = 'application/json, text/plain, */*';
            if (!out['content-type']) out['content-type'] = 'application/json; encoding=utf-8';
            if (!out['agw-js-conv']) out['agw-js-conv'] = 'str';
            return out;
        }

        function captureDoubaoTemplate(url, method, headers, bodyText) {
            if (!isDoubaoSingleChainUrl(url) || String(method || '').toUpperCase() !== 'POST') return;
            doubaoCapturedTemplate = {
                url,
                method: 'POST',
                headers: sanitizeDoubaoHeaders(parseHeadersObject(headers)),
                bodyText: typeof bodyText === 'string' ? bodyText : (bodyText != null ? String(bodyText) : ''),
                ts: Date.now()
            };
        }

        function installDoubaoCaptureHooks() {
            if (!isDoubao || doubaoCaptureHooksInstalled) return;
            doubaoCaptureHooksInstalled = true;

            const rawFetch = window.fetch;
            window.fetch = function (input, init) {
                try {
                    const inputUrl = typeof input === 'string' ? input : input?.url;
                    const url = inputUrl ? new URL(inputUrl, window.location.origin).toString() : '';
                    const method = (init?.method || input?.method || 'GET').toUpperCase();
                    if (isDoubaoSingleChainUrl(url) && method === 'POST') {
                        const headers = init?.headers || input?.headers;
                        const body = init?.body;
                        if (typeof body === 'string') {
                            captureDoubaoTemplate(url, method, headers, body);
                        } else if (body != null) {
                            captureDoubaoTemplate(url, method, headers, String(body));
                        } else if (typeof Request !== 'undefined' && input instanceof Request) {
                            input.clone().text().then((txt) => {
                                captureDoubaoTemplate(url, method, headers, txt || '');
                            }).catch(() => {
                                captureDoubaoTemplate(url, method, headers, '');
                            });
                        } else {
                            captureDoubaoTemplate(url, method, headers, '');
                        }
                    }
                } catch (e) {
                    console.warn('AI-Chat-Nodes: 安装 fetch 抓包模板时出现异常', e);
                }
                return rawFetch.apply(this, arguments);
            };

            const rawXhrOpen = XMLHttpRequest.prototype.open;
            const rawXhrSend = XMLHttpRequest.prototype.send;
            const rawXhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

            XMLHttpRequest.prototype.open = function (method, url) {
                this.__aiNodesDoubaoMethod = String(method || 'GET').toUpperCase();
                this.__aiNodesDoubaoUrl = url ? new URL(url, window.location.origin).toString() : '';
                this.__aiNodesDoubaoHeaders = {};
                return rawXhrOpen.apply(this, arguments);
            };

            XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
                try {
                    if (this.__aiNodesDoubaoHeaders && name) {
                        this.__aiNodesDoubaoHeaders[String(name).toLowerCase()] = String(value);
                    }
                } catch (e) {
                    // ignore
                }
                return rawXhrSetRequestHeader.apply(this, arguments);
            };

            XMLHttpRequest.prototype.send = function (body) {
                try {
                    if (this.__aiNodesDoubaoMethod === 'POST' && isDoubaoSingleChainUrl(this.__aiNodesDoubaoUrl)) {
                        const bodyText = typeof body === 'string' ? body : (body != null ? String(body) : '');
                        captureDoubaoTemplate(this.__aiNodesDoubaoUrl, 'POST', this.__aiNodesDoubaoHeaders, bodyText);
                    }
                } catch (e) {
                    console.warn('AI-Chat-Nodes: 安装 XHR 抓包模板时出现异常', e);
                }
                return rawXhrSend.apply(this, arguments);
            };
        }

        function ensureDoubaoSingleChainUrl(rawUrl) {
            const u = new URL(rawUrl || '/im/chain/single', window.location.origin);
            const defaults = new URLSearchParams(DOUBAO_QUERY_DEFAULTS);
            defaults.forEach((v, k) => {
                if (!u.searchParams.get(k)) u.searchParams.set(k, v);
            });

            let webTabId = u.searchParams.get('web_tab_id');
            if (!webTabId) {
                try {
                    if (doubaoCapturedTemplate?.url) {
                        const fromTemplate = new URL(doubaoCapturedTemplate.url, window.location.origin).searchParams.get('web_tab_id');
                        if (fromTemplate) {
                            webTabId = fromTemplate;
                        }
                    }
                } catch (e) {
                    // ignore template parse errors
                }
            }
            if (!webTabId) {
                webTabId = sessionStorage.getItem('ai-nodes-doubao-web-tab-id') || genUuid();
                u.searchParams.set('web_tab_id', webTabId);
            }
            sessionStorage.setItem('ai-nodes-doubao-web-tab-id', webTabId);
            return u.toString();
        }

        function deepReplaceConversationId(value, convId, parentKey = '') {
            if (value == null) return value;
            if (typeof value === 'string') {
                if (/^(conversation_id|conv_id|chat_id|section_id)$/i.test(parentKey)) {
                    return convId;
                }
                return value;
            }
            if (typeof value === 'number') {
                if (/^(conversation_id|conv_id|chat_id|section_id)$/i.test(parentKey)) {
                    return convId;
                }
                return value;
            }
            if (Array.isArray(value)) return value.map((item) => deepReplaceConversationId(item, convId, parentKey));
            if (typeof value === 'object') {
                const out = {};
                Object.keys(value).forEach((k) => {
                    out[k] = deepReplaceConversationId(value[k], convId, k);
                });
                return out;
            }
            return value;
        }

        function getRecentDoubaoSingleChainUrl() {
            try {
                const entries = performance.getEntriesByType('resource') || [];
                for (let i = entries.length - 1; i >= 0; i--) {
                    const name = entries[i] && entries[i].name ? entries[i].name : '';
                    if (/\/im\/chain\/single\?/i.test(name) && /^https:\/\/www\.doubao\.com\//i.test(name)) {
                        return name;
                    }
                }
            } catch (e) {
                console.warn('AI-Chat-Nodes: 读取 performance 记录失败', e);
            }
            return '';
        }

        function buildDoubaoSingleChainUrl() {
            if (doubaoCapturedTemplate?.url) return ensureDoubaoSingleChainUrl(doubaoCapturedTemplate.url);

            const recent = getRecentDoubaoSingleChainUrl();
            if (recent) return ensureDoubaoSingleChainUrl(recent);

            return ensureDoubaoSingleChainUrl('/im/chain/single');
        }

        function buildDoubaoRequest(convId) {
            const url = buildDoubaoSingleChainUrl();
            const headers = sanitizeDoubaoHeaders(doubaoCapturedTemplate?.headers || {});

            const templateBody = doubaoCapturedTemplate?.bodyText ? safeParseJson(doubaoCapturedTemplate.bodyText) : null;
            let body = null;
            if (templateBody && typeof templateBody === 'object') {
                body = deepReplaceConversationId(templateBody, convId);
            }

            if (!body) {
                body = {
                    cmd: 3100,
                    uplink_body: {
                        pull_singe_chain_uplink_body: {
                            conversation_id: convId,
                            anchor_index: Number.MAX_SAFE_INTEGER,
                            conversation_type: 3,
                            direction: 1,
                            limit: 50,
                            ext: {},
                            filter: {
                                index_list: []
                            }
                        }
                    },
                    sequence_id: genUuid(),
                    channel: 2,
                    version: '1'
                };
            }

            if (!body.sequence_id) {
                body.sequence_id = genUuid();
            } else {
                body.sequence_id = genUuid();
            }

            return {
                url,
                headers,
                bodyText: JSON.stringify(body),
                fromTemplate: Boolean(templateBody)
            };
        }

        function extractDoubaoTextFromBlocks(blocks) {
            if (!Array.isArray(blocks)) return '';

            const lines = [];
            const dedup = new Set();

            const pushText = (text) => {
                const t = String(text || '').trim();
                if (!t || dedup.has(t)) return;
                if (/^[0-9]{14,}$/.test(t)) return;
                if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t)) return;
                if (/^tos-cn-i-[a-z0-9-]+\//i.test(t)) return;
                dedup.add(t);
                lines.push(t);
            };

            const formatDoubaoRequirementClarifyBlock = (reqBlock) => {
                if (!reqBlock || typeof reqBlock !== 'object') return '';

                const requirements = Array.isArray(reqBlock.requirements) ? reqBlock.requirements : [];
                if (!requirements.length) return '';

                const out = [];
                requirements.forEach((group) => {
                    const items = Array.isArray(group?.requirement_items) ? group.requirement_items : [];
                    items.forEach((item) => {
                        const title = String(item?.title || '').trim();
                        const content = String(item?.content || '').trim();
                        const selectedKey = String(item?.selected_requirement_key || '').trim();
                        const selectedTitle = Array.isArray(item?.requirement_items)
                            ? String((item.requirement_items.find((x) => String(x?.key || '') === selectedKey) || {}).title || '').trim()
                            : '';

                        if (title && content) {
                            out.push(`【${title}】\n${content}`);
                        } else if (title) {
                            out.push(`【${title}】`);
                        } else if (content) {
                            out.push(content);
                        }

                        if (selectedTitle) {
                            out.push(`已选风格: ${selectedTitle}`);
                        }
                    });
                });

                return out.join('\n\n').trim();
            };

            const walk = (node) => {
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

                // requirement_clarify_block 使用结构化摘要，避免原始 JSON 与模板 URL 进入导出
                const reqBlock = node?.content?.requirement_clarify_block || node?.requirement_clarify_block;
                if (reqBlock) {
                    const summary = formatDoubaoRequirementClarifyBlock(reqBlock);
                    if (summary) pushText(summary);
                    return;
                }

                const content = node.content || node;
                const textBlock = content.text_block;
                const referenceBlock = content.reference_block;

                if (textBlock && typeof textBlock.text === 'string') pushText(textBlock.text);
                if (referenceBlock && referenceBlock.text && typeof referenceBlock.text.text === 'string') {
                    pushText(referenceBlock.text.text);
                }
                if (typeof node.text === 'string') pushText(node.text);
                if (typeof node.content === 'string') pushText(node.content);

                Object.values(node).forEach(walk);
            };

            walk(blocks);
            return lines.join('\n').trim();
        }

        function parseDoubaoContentPayload(contentValue) {
            if (typeof contentValue !== 'string') return '';

            const raw = contentValue.trim();
            if (!raw) return '';

            const parsed = safeParseJson(raw);
            if (!parsed || typeof parsed !== 'object') return raw;

            // 豆包有时把 blocks 数组序列化塞进 content，避免原样输出原始 JSON。
            if (Array.isArray(parsed)) {
                const extracted = extractDoubaoTextFromBlocks(parsed);
                return extracted || '';
            }

            const lines = [];
            const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
            if (text) lines.push(text);

            const entities = Array.isArray(parsed.entities) ? parsed.entities : [];
            entities.forEach((entity, idx) => {
                if (!entity || typeof entity !== 'object') return;
                const image = entity?.entity_content?.image || {};
                const url = image?.image_ori?.url
                    || image?.preview_img?.url
                    || image?.image_thumb?.url
                    || '';
                const key = typeof image?.key === 'string' ? image.key.trim() : '';
                const serial = entities.length > 1 ? String(idx + 1) : '';

                if (url) {
                    lines.push(`[图片${serial}] ${url}`);
                } else if (key) {
                    lines.push(`[图片${serial}] ${key}`);
                }
            });

            return lines.length ? lines.join('\n') : '';
        }

        function getDoubaoWebTabId() {
            try {
                if (doubaoCapturedTemplate?.url) {
                    const fromTemplate = new URL(doubaoCapturedTemplate.url, window.location.origin).searchParams.get('web_tab_id');
                    if (fromTemplate) return fromTemplate;
                }
            } catch (e) {
                // ignore
            }
            const fromStorage = sessionStorage.getItem('ai-nodes-doubao-web-tab-id');
            return fromStorage || genUuid();
        }

        function buildDoubaoArtifactUrl(codeId, version = '') {
            const u = new URL('/samantha/code/get_artifact', window.location.origin);
            const defaults = new URLSearchParams(DOUBAO_QUERY_DEFAULTS);
            defaults.forEach((v, k) => {
                if (!u.searchParams.get(k)) u.searchParams.set(k, v);
            });
            u.searchParams.set('web_tab_id', getDoubaoWebTabId());
            u.searchParams.set('code_id', String(codeId || '').trim());
            if (version != null && String(version).trim()) {
                u.searchParams.set('version', String(version).trim());
            }
            return u.toString();
        }

        function buildCodeFence(language, code) {
            const lang = String(language || '').trim();
            const text = String(code || '').trim();
            if (!text) return '';
            return `\n\n\`\`\`${lang}\n${text}\n\`\`\``;
        }

        function extractDoubaoArtifactText(json) {
            if (!json || typeof json !== 'object') return '';
            const out = [];
            const seen = new Set();

            const push = (label, text, language = '') => {
                const t = String(text || '').trim();
                if (!t) return;
                const key = `${label}::${t.slice(0, 240)}`;
                if (seen.has(key)) return;
                seen.add(key);
                if (label) {
                    out.push(`【${label}】` + buildCodeFence(language, t));
                } else {
                    out.push(buildCodeFence(language, t) || t);
                }
            };

            const walk = (node) => {
                if (!node) return;
                if (Array.isArray(node)) {
                    node.forEach(walk);
                    return;
                }
                if (typeof node !== 'object') return;

                const fileName = String(node?.name || node?.file_name || node?.filename || node?.path || '').trim();
                const lang = String(node?.language || node?.lang || '').trim();

                const codeCandidates = [
                    node?.content,
                    node?.code,
                    node?.source,
                    node?.text,
                    node?.artifact_content,
                    node?.raw_content,
                    node?.value
                ];

                codeCandidates.forEach((c) => {
                    if (typeof c === 'string' && c.trim()) {
                        const hasLineBreak = c.includes('\n');
                        const hasCodeHint = /function|class|import|export|const|let|var|<\/?[a-z][\s>]/i.test(c);
                        if (hasLineBreak || hasCodeHint || fileName) {
                            push(fileName || '', c, lang);
                        }
                    }
                });

                if (Array.isArray(node?.files)) {
                    node.files.forEach((f) => {
                        const fn = String(f?.name || f?.file_name || f?.filename || f?.path || '').trim();
                        const fl = String(f?.language || f?.lang || '').trim();
                        const fc = typeof f?.content === 'string'
                            ? f.content
                            : (typeof f?.code === 'string' ? f.code : (typeof f?.text === 'string' ? f.text : ''));
                        if (fc && fn) {
                            push(fn, fc, fl);
                        }
                    });
                }

                Object.values(node).forEach((v) => {
                    if (v && typeof v === 'object') walk(v);
                });
            };

            walk(json?.data || json);
            return out.join('\n').trim();
        }

        async function fetchDoubaoArtifactContent(codeId, version = '', headers = {}) {
            const id = String(codeId || '').trim();
            if (!id) return '';

            const v = String(version || '').trim();
            const cacheKey = `${id}@${v}`;
            if (doubaoArtifactContentCache.has(cacheKey)) {
                return doubaoArtifactContentCache.get(cacheKey) || '';
            }

            try {
                const resp = await fetch(buildDoubaoArtifactUrl(id, v), {
                    method: 'GET',
                    credentials: 'include',
                    headers: sanitizeDoubaoHeaders({
                        ...headers,
                        accept: 'application/json, text/plain, */*'
                    })
                });

                if (!resp.ok) {
                    doubaoArtifactContentCache.set(cacheKey, '');
                    return '';
                }

                const raw = await resp.text();
                const json = safeParseJson(raw);
                const extracted = json ? extractDoubaoArtifactText(json) : '';
                const finalText = extracted || (typeof raw === 'string' && raw.length < 50000 ? raw.trim() : '');
                doubaoArtifactContentCache.set(cacheKey, finalText);
                return finalText;
            } catch (e) {
                doubaoArtifactContentCache.set(cacheKey, '');
                return '';
            }
        }

        function getDoubaoArtifactMetaFromBlock(block) {
            const ab = block?.content?.artifact_block || block?.artifact_block;
            if (!ab || typeof ab !== 'object') return null;
            const codeId = String(ab.resource_id || '').trim();
            if (!codeId) return null;
            return {
                codeId,
                version: String(ab.resource_version || ab.version || '').trim(),
                title: String(ab.title || ab.artifact_topic || '代码编辑器').trim()
            };
        }

        async function extractDoubaoArtifactTextFromContentBlocks(contentBlocks, headers = {}) {
            if (!Array.isArray(contentBlocks) || !contentBlocks.length) return '';
            const blocks = [];

            contentBlocks.forEach((b) => {
                const meta = getDoubaoArtifactMetaFromBlock(b);
                if (meta) blocks.push(meta);
            });

            if (!blocks.length) return '';

            const out = [];
            for (const meta of blocks) {
                const artifactText = await fetchDoubaoArtifactContent(meta.codeId, meta.version, headers);
                if (!artifactText) continue;
                out.push(`【${meta.title || '代码编辑器内容'}】\n${artifactText}`);
            }
            return out.join('\n\n').trim();
        }

        function getDisplayTextForExport(rawText) {
            if (rawText == null) return '';
            const text = String(rawText).trim();
            if (!text) return '';
            return parseDoubaoContentPayload(text);
        }

        function normalizeDoubaoCompareText(text) {
            return String(text || '')
                .replace(/[\r\n]+/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function uniqueDoubaoTextParts(candidates) {
            const out = [];
            const seen = new Set();
            (Array.isArray(candidates) ? candidates : []).forEach((item) => {
                const raw = String(item || '').trim();
                if (!raw) return;
                const key = normalizeDoubaoCompareText(raw);
                if (!key || seen.has(key)) return;
                seen.add(key);
                out.push(raw);
            });
            return out;
        }

        async function parseDoubaoSingleChainMessages(respJson, requestHeaders = {}) {
            let rawMessages = respJson?.downlink_body?.pull_singe_chain_downlink_body?.messages;
            if (!Array.isArray(rawMessages)) {
                const queue = [respJson];
                while (queue.length) {
                    const cur = queue.shift();
                    if (!cur || typeof cur !== 'object') continue;
                    if (Array.isArray(cur.messages)) {
                        rawMessages = cur.messages;
                        break;
                    }
                    Object.values(cur).forEach((v) => {
                        if (v && typeof v === 'object') queue.push(v);
                    });
                }
            }
            if (!Array.isArray(rawMessages)) return [];

            const built = [];
            for (const m of rawMessages) {
                const role = Number(m?.user_type) === 1 ? 'user' : 'assistant';
                const blockText = Array.isArray(m?.content_block)
                    ? extractDoubaoTextFromBlocks(m.content_block)
                    : '';
                const artifactText = await extractDoubaoArtifactTextFromContentBlocks(m?.content_block, requestHeaders);
                const contentText = parseDoubaoContentPayload(m?.content);
                const ttsText = typeof m?.tts_content === 'string' ? m.tts_content.trim() : '';

                const normalCandidates = role === 'user'
                    ? [ttsText, blockText, contentText]
                    : [blockText, contentText, ttsText];

                const normalParts = uniqueDoubaoTextParts(normalCandidates);

                let userExtraLines = [];
                if (role === 'user' && ttsText) {
                    const ttsKey = normalizeDoubaoCompareText(ttsText);
                    const lineSeen = new Set([ttsKey]);
                    normalParts.forEach((part) => {
                        if (normalizeDoubaoCompareText(part) === ttsKey) return;

                        // block/content 里可能包含完整 tts，再拼接会导致重复，先剔除再按行去重。
                        const cleaned = String(part).replace(ttsText, '\n');
                        cleaned
                            .split(/\r?\n/)
                            .map((line) => line.trim())
                            .filter(Boolean)
                            .forEach((line) => {
                                const key = normalizeDoubaoCompareText(line);
                                if (!key || lineSeen.has(key)) return;
                                lineSeen.add(key);
                                userExtraLines.push(line);
                            });
                    });
                }

                const normalText = role === 'user' && ttsText
                    ? [
                        ttsText,
                        ...userExtraLines
                    ].join('\n').trim()
                    : (normalParts.join('\n\n').trim() || ttsText);

                const indexInConv = Number(m?.index_in_conv || 0);
                const createTime = Number(m?.create_time || 0);

                if (normalText) {
                    built.push({ role, text: normalText, indexInConv, createTime, subOrder: 0, isArtifact: false });
                }
                if (artifactText) {
                    built.push({ role, text: artifactText, indexInConv, createTime, subOrder: 1, isArtifact: true });
                }
            }

            const mapped = built
                .sort((a, b) => {
                    if ((a.indexInConv || 0) !== (b.indexInConv || 0)) {
                        return (a.indexInConv || 0) - (b.indexInConv || 0);
                    }
                    if ((a.createTime || 0) !== (b.createTime || 0)) {
                        return (a.createTime || 0) - (b.createTime || 0);
                    }
                    return (a.subOrder || 0) - (b.subOrder || 0);
                })
                .map(({ role, text, isArtifact }) => ({ role, text, isArtifact: Boolean(isArtifact) }));

            return mapped;
        }

        async function getDoubaoMessagesByApi() {
            if (!isDoubao) return [];
            installDoubaoCaptureHooks();

            const convId = getDoubaoConversationIdFromUrl();
            if (!convId) return [];

            const req = buildDoubaoRequest(convId);

            try {
                const resp = await fetch(req.url, {
                    method: 'POST',
                    credentials: 'include',
                    headers: req.headers,
                    body: req.bodyText
                });

                if (!resp.ok) {
                    const mode = req.fromTemplate ? 'template' : 'fallback';
                    console.warn(`AI-Chat-Nodes: 豆包会话 API 请求失败 (${resp.status}, mode=${mode})`);
                    return [];
                }

                const rawText = await resp.text();
                const json = safeParseJson(rawText);
                if (!json) {
                    const mode = req.fromTemplate ? 'template' : 'fallback';
                    console.warn(`AI-Chat-Nodes: 豆包会话 API 返回非 JSON 响应 (mode=${mode})`);
                    return [];
                }
                const parsed = await parseDoubaoSingleChainMessages(json, req.headers);
                if (parsed.length) return parsed;
                if (Number(json?.status_code) !== 0) {
                    const mode = req.fromTemplate ? 'template' : 'fallback';
                    console.warn(`AI-Chat-Nodes: 豆包会话 API 返回异常 status_code=${json?.status_code || 'unknown'} (mode=${mode})`);
                } else {
                    const mode = req.fromTemplate ? 'template' : 'fallback';
                    console.warn(`AI-Chat-Nodes: 豆包会话 API 成功但未解析到消息 (mode=${mode})`);
                }
                return [];
            } catch (e) {
                console.warn('AI-Chat-Nodes: 豆包会话 API 解析失败', e);
                return [];
            }
        }

        // 获取当前对话的所有消息
        async function getAllMessages() {
            const list = [];
            let source = 'DOM';
            if (isChatGPT) {
                // 优先使用 ChatGPT 官方会话接口，尽可能保留消息原始结构
                const apiMsgs = await getChatGPTMessagesByApi();
                if (apiMsgs.length) {
                    list.push(...apiMsgs);
                    source = 'API';
                } else {
                    // API 不可用时回退 DOM 抽取
                    const turns = document.querySelectorAll('article, section[data-turn]');
                    turns.forEach(turn => {
                        const role = turn.getAttribute('data-turn') ||
                            turn.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role');
                        if (!role) return;

                        let text = '';
                        if (role === 'user') {
                            const userEl = turn.querySelector('.whitespace-pre-wrap');
                            text = userEl ? userEl.innerText.trim() : '';
                        } else if (role === 'assistant') {
                            const aiEl = turn.querySelector('.markdown');
                            text = aiEl ? aiEl.innerText.trim() : '';
                        }

                        if (text) list.push({ role: role === 'user' ? 'user' : 'assistant', text });
                    });
                }
            } else if (isQwen) {
                const apiMsgs = await getQwenMessagesByApi();
                source = 'API(/api/v1/session/msg/list)';
                if (apiMsgs.length) {
                    list.push(...apiMsgs);
                } else {
                    source = 'API(/api/v1/session/msg/list)-FAILED';
                    console.warn('AI-Chat-Nodes: 千问导出已禁用 DOM 回退，当前仅支持 API 获取。');
                    return { messages: [], source };
                }
            } else if (isDoubao) {
                const apiMsgs = await getDoubaoMessagesByApi();
                source = 'API(/im/chain/single)';
                if (apiMsgs.length) {
                    list.push(...apiMsgs);
                } else {
                    source = 'API(/im/chain/single)-FAILED';
                    console.warn('AI-Chat-Nodes: 豆包导出已禁用 DOM 回退，当前仅支持 API 获取。');
                    return { messages: [], source };
                }
            } else if (isDeepSeek) {
                const apiMsgs = await getDeepSeekMessagesByApi();
                source = 'API(/api/v0/chat/history_messages)';
                if (apiMsgs.length) {
                    list.push(...apiMsgs.map((m) => ({
                        role: m.role,
                        text: m.text,
                        isThought: Boolean(m.isThought),
                        isSearch: Boolean(m.isSearch),
                        fragmentType: String(m.fragmentType || '')
                    })));
                } else {
                    source = 'API(/api/v0/chat/history_messages)-FAILED';
                    console.warn('AI-Chat-Nodes: DeepSeek 导出已禁用 DOM 回退，当前仅支持 API 获取。');
                    return { messages: [], source };
                }
            }
            
            // 核心归一化：将连续出现的同角色消息物理合并（解决 DeepSeek 思考与回答分容器的问题）
            const normalized = [];
            list.forEach(msg => {
                const last = normalized[normalized.length - 1];
                const shouldMerge = last
                    && last.role === msg.role
                    && Boolean(last.isArtifact) === Boolean(msg.isArtifact)
                    // DeepSeek 需要严格区分 THINK / RESPONSE / SEARCH，禁止跨类型合并
                    && (!isDeepSeek || (
                        Boolean(last.isThought) === Boolean(msg.isThought)
                        && Boolean(last.isSearch) === Boolean(msg.isSearch)
                        && String(last.fragmentType || '') === String(msg.fragmentType || '')
                    ));

                if (shouldMerge) {
                    last.text += "\n\n" + msg.text;
                    if (last.html && msg.html) last.html += msg.html;
                } else {
                    normalized.push(msg);
                }
            });
            return { messages: normalized, source };
        }

        // 处理文件保存逻辑
        function handleExport(data, format) {
            const fileName = `${AI_NAME}_Export_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}`;
            let content = '';
            let type = 'text/plain;charset=utf-8';
            let ext = format;
            const exportData = data.map((m) => {
                const rawText = m?.text == null ? '' : String(m.text).trim();
                const displayText = getDisplayTextForExport(rawText);
                return {
                    ...m,
                    __rawText: rawText,
                    __displayText: displayText
                };
            });

            const deepSeekExportMeta = (() => {
                if (!isDeepSeek || !deepseekLastSessionMeta) return null;
                const cs = deepseekLastSessionMeta.chatSession || {};
                const sample = Array.isArray(deepseekLastSessionMeta?.messageStats?.sample)
                    ? deepseekLastSessionMeta.messageStats.sample
                    : [];
                return {
                    sessionId: String(cs.id || ''),
                    title: String(cs.title || ''),
                    pinned: Boolean(cs.pinned),
                    createdAt: String(cs.insertedAt || ''),
                    updatedAt: String(cs.updatedAt || ''),
                    thinkingEnabled: sample.some((s) => Boolean(s?.thinkingEnabled)),
                    searchEnabled: sample.some((s) => Boolean(s?.searchEnabled))
                };
            })();

            const deepSeekMetaText = deepSeekExportMeta
                ? [
                    '【DeepSeek 对话信息】',
                    `会话ID: ${deepSeekExportMeta.sessionId || '-'}`,
                    `标题: ${deepSeekExportMeta.title || '-'}`,
                    `已置顶: ${deepSeekExportMeta.pinned ? '是' : '否'}`,
                    `创建时间: ${deepSeekExportMeta.createdAt || '-'}`,
                    `更新时间: ${deepSeekExportMeta.updatedAt || '-'}`,
                    `深度思考: ${deepSeekExportMeta.thinkingEnabled ? '开启' : '关闭'}`,
                    `智能搜索: ${deepSeekExportMeta.searchEnabled ? '开启' : '关闭'}`
                ].join('\n')
                : '';

            if (format === 'json') {
                if (deepSeekExportMeta) {
                    content = JSON.stringify({
                        platform: 'DeepSeek',
                        sessionInfo: {
                            id: deepSeekExportMeta.sessionId,
                            title: deepSeekExportMeta.title,
                            pinned: deepSeekExportMeta.pinned,
                            createdAt: deepSeekExportMeta.createdAt,
                            updatedAt: deepSeekExportMeta.updatedAt,
                            thinkingEnabled: deepSeekExportMeta.thinkingEnabled,
                            searchEnabled: deepSeekExportMeta.searchEnabled
                        },
                        messages: exportData.map(m => ({ role: m.role, text: m.__displayText }))
                    }, null, 2);
                } else {
                    content = JSON.stringify(exportData.map(m => ({ role: m.role, text: m.__displayText })), null, 2);
                }
                type = 'application/json';
            } else if (format === 'csv') {
                const rows = [];
                if (deepSeekExportMeta) {
                    rows.push(`Meta,"${deepSeekMetaText.replace(/"/g, '""').replace(/\n/g, ' ; ')}"`);
                }
                rows.push(...exportData.map(m => `${m.role === 'user' ? 'User' : AI_NAME},"${m.__displayText.replace(/"/g, '""')}"`));
                content = '\uFEFFRole,Content\n' + rows.join('\n');
                type = 'text/csv';
            } else if (format === 'txt') {
                const body = exportData.map(m => `----------------------------\n【${m.role === 'user' ? '用户问题' : AI_NAME}】\n----------------------------\n${m.__displayText}`).join('\n\n');
                content = deepSeekMetaText ? `${deepSeekMetaText}\n\n${body}` : body;
            } else if (format === 'md') {
                const body = exportData.map(m => `### ${m.role === 'user' ? '🧑 用户问题' : '🤖 ' + AI_NAME + '回答'}\n\n${m.__displayText}`).join('\n\n---\n\n');
                if (deepSeekMetaText) {
                    const mdMeta = [
                        '## DeepSeek 对话信息',
                        '',
                        `- 会话ID: ${deepSeekExportMeta.sessionId || '-'}`,
                        `- 标题: ${deepSeekExportMeta.title || '-'}`,
                        `- 已置顶: ${deepSeekExportMeta.pinned ? '是' : '否'}`,
                        `- 创建时间: ${deepSeekExportMeta.createdAt || '-'}`,
                        `- 更新时间: ${deepSeekExportMeta.updatedAt || '-'}`,
                        `- 深度思考: ${deepSeekExportMeta.thinkingEnabled ? '开启' : '关闭'}`,
                        `- 智能搜索: ${deepSeekExportMeta.searchEnabled ? '开启' : '关闭'}`,
                        ''
                    ].join('\n');
                    content = `${mdMeta}\n---\n\n${body}`;
                } else {
                    content = body;
                }
            } else if (format === 'pdf') {
                const win = window.open('', '_blank');
                // 聚合逻辑：将 User 发起及随后跟随的所有连续 Assistant 回复视为一个对话组（1 轮）
                const groups = [];
                for (let i = 0; i < exportData.length; i++) {
                    const turn = [exportData[i]];
                    // 如果当前是用户且后续有助手消息，则把后续所有连续的助手消息全部卷进来
                    if (exportData[i].role === 'user') {
                        while (i + 1 < exportData.length && exportData[i + 1].role === 'assistant') {
                            turn.push(exportData[i + 1]);
                            i++;
                        }
                    }
                    groups.push(turn);
                }

                const html = `<html><head><title>对话记录导导出 - ${AI_NAME}</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 0; margin: 0; color: #1a202c; background: #f8fafc; }
                    .page { padding: 50px 60px; page-break-after: always; min-height: 90vh; display: flex; flex-direction: column; max-width: 900px; margin: 0 auto; background: #fff; box-shadow: 0 0 40px rgba(0,0,0,0.05); }
                    .page:last-child { page-break-after: auto; }
                    .header { border-bottom: 3px solid #3b82f6; padding-bottom: 16px; margin-bottom: 40px; color: #1e40af; display: flex; justify-content: space-between; align-items: flex-end; }
                    .header .title { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
                    .msg { margin-bottom: 25px; padding: 24px; border-radius: 16px; line-height: 1.6; position: relative; border: 1px solid #e2e8f0; transition: transform 0.2s; }
                    .user { background: #f0f9ff; border-color: #bae6fd; }
                    .assistant { background: #ffffff; border-color: #f1f5f9; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
                    .role-badge { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; margin-bottom: 14px; text-transform: uppercase; color: #64748b; }
                    .user .role-badge { color: #0369a1; }
                    .assistant .role-badge { color: #4b5563; }
                    
                    /* 万能代码块与排版适配 */
                    .text { font-size: 14px; color: #334155; line-height: 1.7; word-break: break-word; }
                    pre, .qk-markdown pre, .markdown-body pre, [class*="code-block"] pre {
                        background: #1e1e1e !important;
                        color: #d4d4d4 !important;
                        padding: 16px;
                        border-radius: 10px;
                        overflow-x: auto;
                        font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
                        margin: 15px 0;
                        border: 1px solid #333;
                        display: block;
                        font-size: 13px;
                    }
                    code { background: #f1f5f9; padding: 2px 5px; border-radius: 4px; font-family: monospace; color: #e11d48; }
                    pre code { background: none; padding: 0; color: inherit; }
                    
                    /* 深度思考与引用块 */
                    .thought-process, blockquote { 
                        background: #f8fcfb; 
                        border-radius: 12px; 
                        padding: 18px; 
                        margin: 15px 0; 
                        border: 1px dashed #9333ea; 
                        color: #4b5563; 
                        font-size: 13px; 
                        font-style: italic;
                    }
                    .thought-process::before {
                        content: "✦ 深度思考过程";
                        display: block;
                        font-weight: 700;
                        color: #9333ea;
                        margin-bottom: 8px;
                        font-style: normal;
                        font-size: 11px;
                        text-transform: uppercase;
                    }
                    
                    table { border-collapse: collapse; width: 100%; margin: 15px 0; border: 1px solid #e2e8f0; font-size: 13px; }
                    th, td { border: 1px solid #e2e8f0; padding: 10px; text-align: left; }
                    th { background: #f8fafc; font-weight: 700; }
                    ul, ol { padding-left: 24px; margin: 10px 0; }
                    p { margin: 12px 0; }
                    img { max-width: 100%; height: auto; border-radius: 8px; }
                    .footer { margin-top: auto; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: right; font-size: 11px; color: #94a3b8; }
                    @media print { 
                        body { background: #fff; }
                        .page { box-shadow: none; padding: 30px; margin: 0; width: 100%; max-width: none; }
                    }
                </style></head><body>
                    ${groups.map((group, idx) => `
                        <div class="page">
                            <div class="header">
                                <div class="title">第 ${idx + 1} 轮对话</div>
                                <div style="font-size:12px; color:#94a3b8; font-weight:500;">AI Chat Nodes Exporter v1.6.0</div>
                            </div>
                            ${deepSeekExportMeta && idx === 0 ? `
                                <div style="margin:-12px 0 20px;padding:12px 14px;border:1px solid #dbeafe;border-radius:10px;background:#eff6ff;font-size:12px;color:#1e3a8a;line-height:1.7;">
                                    <div style="font-weight:700;margin-bottom:6px;">DeepSeek 对话信息</div>
                                    <div>会话ID: ${escapeHtml(deepSeekExportMeta.sessionId || '-')}</div>
                                    <div>标题: ${escapeHtml(deepSeekExportMeta.title || '-')}</div>
                                    <div>已置顶: ${deepSeekExportMeta.pinned ? '是' : '否'} | 深度思考: ${deepSeekExportMeta.thinkingEnabled ? '开启' : '关闭'} | 智能搜索: ${deepSeekExportMeta.searchEnabled ? '开启' : '关闭'}</div>
                                    <div>创建时间: ${escapeHtml(deepSeekExportMeta.createdAt || '-')} | 更新时间: ${escapeHtml(deepSeekExportMeta.updatedAt || '-')}</div>
                                </div>
                            ` : ''}
                            <div style="flex:1;">
                                ${group.map(m => `
                                    <div class="msg ${m.role}">
                                        <div class="role-badge">
                                            ${m.role === 'user' ? '🧑 USER QUESTION' : '🤖 ' + AI_NAME.toUpperCase() + ' RESPONSE'}
                                        </div>
                                        <div class="text">${(m.html && m.__displayText === m.__rawText)
                                            ? m.html
                                            : m.__displayText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>')}</div>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="footer">Exported via AI-Chat-Nodes • ${new Date().toLocaleString()}</div>
                        </div>
                    `).join('')}
                </body></html>`;
                win.document.write(html);
                win.document.close();
                setTimeout(() => win.print(), 1000);
                return;
            }

            const blob = new Blob([content], { type });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${fileName}.${ext}`;
            a.click();
            URL.revokeObjectURL(url);
        }

        // 导出管理模态框
        async function openExportModal() {
            const normalizeSourceLabel = (raw) => {
                const s = String(raw || 'DOM').toUpperCase();
                if (s.includes('API')) return 'API';
                return 'DOM';
            };

            const renderDeepSeekSessionPanel = (meta) => {
                if (!isDeepSeek || !meta) return '';
                const cs = meta.chatSession || {};
                const st = meta.messageStats || {};
                const sample = Array.isArray(st.sample) ? st.sample : [];

                const tags = [
                    `会话ID: ${cs.id || '-'}`,
                    `标题: ${cs.title || '-'}`,
                    `已置顶: ${cs.pinned ? '是' : '否'}`,
                    `创建时间: ${cs.insertedAt || '-'}`,
                    `更新时间: ${cs.updatedAt || '-'}`
                ];

                const thinkingOn = sample.some((s) => Boolean(s?.thinkingEnabled));
                const searchOn = sample.some((s) => Boolean(s?.searchEnabled));
                const sampleTags = [
                    `<span class="m-ds-tag m-ds-tag-soft">深度思考: ${thinkingOn ? '开启' : '关闭'}</span>`,
                    `<span class="m-ds-tag m-ds-tag-soft">智能搜索: ${searchOn ? '开启' : '关闭'}</span>`
                ].join('');

                return `
                    <details class="m-ds-session-panel">
                        <summary class="m-ds-session-title">DeepSeek 对话信息（点击展开）</summary>
                        <div class="m-ds-session-body">
                            <div class="m-ds-tag-wrap">${tags.map((t) => `<span class="m-ds-tag">${t}</span>`).join('')}</div>
                            ${sampleTags ? `<div class="m-ds-session-subtitle">chat_messages 状态</div><div class="m-ds-tag-wrap">${sampleTags}</div>` : ''}
                        </div>
                    </details>
                `;
            };

            const renderHeader = (sourceLabel) => `
                <div style="padding:20px 24px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <h3 style="margin:0;font-size:18px;">对话导出管理</h3>
                        <span style="font-size:12px;padding:4px 8px;border-radius:999px;background:#f3f4f6;color:#374151;border:1px solid #e5e7eb;">来源：${sourceLabel}</span>
                    </div>
                    <button id="modal-x" style="cursor:pointer;border:none;background:#eee;width:28px;height:28px;border-radius:50%;font-size:16px;display:flex;align-items:center;justify-content:center;">&times;</button>
                </div>
            `;

            const overlay = document.createElement('div');
            overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:40px;`;

            const modal = document.createElement('div');
            modal.style.cssText = `background:#fff;width:100%;max-width:850px;height:85vh;border-radius:20px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 15px 45px rgba(0,0,0,0.3);`;

            const closeModal = () => {
                if (overlay.parentNode) document.body.removeChild(overlay);
            };

            overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

            modal.innerHTML = `
                ${renderHeader('检测中...')}
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#4b5563;">
                    <div class="m-loading-spinner" style="width:34px;height:34px;border:3px solid #e5e7eb;border-top-color:#1E88E5;border-radius:50%;animation:m-spin 0.9s linear infinite;"></div>
                    <div style="font-size:14px;font-weight:600;">正在加载对话内容...</div>
                    <div style="font-size:12px;color:#9ca3af;">请稍候，导出列表即将就绪</div>
                </div>
                <style>
                    @keyframes m-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                </style>
            `;

            document.body.appendChild(overlay);
            overlay.appendChild(modal);
            modal.querySelector('#modal-x').onclick = closeModal;

            let allMsgs = [];
            let sourceLabel = 'DOM';
            let deepseekMeta = null;
            try {
                const result = await getAllMessages();
                allMsgs = Array.isArray(result) ? result : (result.messages || []);
                const rawSource = Array.isArray(result) ? 'DOM' : (result.source || 'DOM');
                sourceLabel = normalizeSourceLabel(rawSource);
                if (isDeepSeek) deepseekMeta = deepseekLastSessionMeta;
            } catch (e) {
                console.warn('AI-Chat-Nodes: 获取导出消息失败', e);
            }

            if (!overlay.parentNode) return;

            if (!allMsgs.length) {
                modal.innerHTML = `
                    ${renderHeader(sourceLabel)}
                    <div style="flex:1;display:flex;align-items:center;justify-content:center;color:#6b7280;font-size:14px;">未检测到可导出的内容</div>
                `;
                modal.querySelector('#modal-x').onclick = closeModal;
                return;
            }

            modal.innerHTML = `
                ${renderHeader(sourceLabel)}
                <div style="padding:10px 24px;background:#f8f9fa;border-bottom:1px solid #eee;display:flex;gap:12px;align-items:center;">
                    <button class="m-util-btn" id="m-all">全选</button>
                    <button class="m-util-btn" id="m-none">取消全选</button>
                    <button class="m-util-btn" id="m-ans" style="background:#e7f3ff;color:#0d6efd;">仅选回答</button>
                    ${isDeepSeek ? '<button class="m-util-btn" id="m-no-thought" style="background:#fff7e6;color:#d46b08;border-color:#ffd591;">排除思考过程</button>' : ''}
                    <div style="flex:1"></div>
                    <span style="font-size:12px;color:#666;">已选 <b id="m-count-view">${allMsgs.length}</b> 条</span>
                </div>
                ${renderDeepSeekSessionPanel(deepseekMeta)}
                <div id="m-list-box" style="flex:1;overflow-y:auto;padding:10px 24px;"></div>
                <div style="padding:24px;border-top:1px solid #eee;display:flex;gap:12px;">
                    <button class="m-ex-btn" data-f="md" style="background:#333;">Markdown</button>
                    <button class="m-ex-btn" data-f="pdf" style="background:#dc3545;">PDF 打印</button>
                    <button class="m-ex-btn" data-f="txt" style="background:#28a745;">文本 (TXT)</button>
                    <button class="m-ex-btn" data-f="json" style="background:#f39c12;">JSON</button>
                </div>
                <style>
                    .m-util-btn { cursor:pointer;padding:6px 12px;border:1px solid #ddd;border-radius:8px;background:#fff;font-size:12px; }
                    .m-ex-btn { cursor:pointer;flex:1;padding:12px;border:none;border-radius:10px;color:#fff;font-weight:700;font-size:13px;transition:0.2s; }
                    .m-ex-btn:hover { opacity:0.9; }
                    .m-item-row { display:flex;gap:15px;padding:16px;border-bottom:1px solid #f2f2f2;position:relative;transition:background 0.2s; }
                    .m-item-row:hover { background:#fcfdfe; }
                    .m-msg-wrap { width:100%; display:flex; align-items:center; gap:12px; }
                    .m-msg-wrap.assistant { justify-content:flex-start; }
                    .m-msg-wrap.user { justify-content:flex-end; }
                    .m-view-btn { opacity:0; pointer-events:none; border:none; background:#007bff; padding:5px 12px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer; color:#fff; transition:all 0.2s; box-shadow:0 4px 12px rgba(0,123,255,0.25); z-index:10; flex-shrink:0; }
                    .m-view-btn:hover { background:#0056b3; transform:scale(1.05); }
                    .m-item-row:hover .m-view-btn { opacity:1; pointer-events:auto; }
                    .m-ds-session-panel { margin:8px 24px 0; border:1px solid #e5e7eb; border-radius:10px; background:linear-gradient(180deg,#fbfdff 0%, #f8fafc 100%); }
                    .m-ds-session-title { cursor:pointer; list-style:none; font-size:12px; font-weight:700; color:#1f2937; padding:8px 12px; user-select:none; }
                    .m-ds-session-title::-webkit-details-marker { display:none; }
                    .m-ds-session-body { padding:0 12px 10px; max-height:180px; overflow:auto; }
                    .m-ds-session-subtitle { font-size:11px; font-weight:700; color:#4b5563; margin-top:8px; margin-bottom:6px; }
                    .m-ds-tag-wrap { display:flex; flex-wrap:wrap; gap:6px; }
                    .m-ds-tag { display:inline-flex; align-items:center; padding:3px 8px; border:1px solid #dbeafe; border-radius:999px; background:#eff6ff; color:#1e3a8a; font-size:11px; line-height:1.4; }
                    .m-ds-tag-soft { border-color:#e5e7eb; background:#f9fafb; color:#374151; }
                </style>
            `;

            const listBox = modal.querySelector('#m-list-box');

            const getDisplayLabel = (msg) => {
                if (msg.role === 'user') return '用户问题';
                if (isDoubao && msg.isArtifact) return '豆包 代码编辑器内容';
                if (isDeepSeek) {
                    if (msg.isThought) return 'DeepSeek 思考过程';
                    if (msg.isSearch || String(msg.fragmentType || '').toUpperCase() === 'SEARCH') return 'DeepSeek 智能搜索';
                    if (String(msg.fragmentType || '').toUpperCase() === 'RESPONSE') return 'DeepSeek AI回答';
                }
                return AI_NAME;
            };

            allMsgs.forEach((m, i) => {
                const item = document.createElement('div');
                item.className = 'm-item-row';
                if (m.isThought) item.setAttribute('data-is-thought', 'true');
                const isU = m.role === 'user';
                const modalText = getDisplayTextForExport(m.text);
                const displayLabel = getDisplayLabel(m);
                
                item.style.cssText = `display:flex; gap:10px; padding:15px 20px; border-bottom:1px solid #f8f8f8; position:relative;`;

                item.innerHTML = `
                    <div style="width:25px; flex-shrink:0; display:flex; align-items:center;">
                        <input type="checkbox" class="m-row-ck" data-i="${i}" checked style="width:18px;height:18px;cursor:pointer;">
                    </div>
                    <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
                        <div class="m-msg-wrap ${isU ? 'user' : 'assistant'}">
                            ${isU ? '<button class="m-view-btn">查看全文</button>' : ''}
                            <div class="m-bubble" style="
                            max-width:85%;
                            padding:12px 16px;
                            border-radius:16px;
                            font-size:13px;
                            line-height:1.6;
                            word-break:break-all;
                            position:relative;
                            ${isU ? 'align-self:flex-end; background:#e7f3ff; border-bottom-right-radius:4px; color:#2c3e50;' : 'align-self:flex-start; background:#f5f5f5; border-bottom-left-radius:4px; color:#333;'}
                        ">
                            <div style="font-size:10px; font-weight:700; margin-bottom:5px; opacity:0.7;">${displayLabel}</div>
                            <div class="m-row-text" style="display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; text-overflow:ellipsis;"></div>
                            </div>
                            ${isU ? '' : '<button class="m-view-btn">查看全文</button>'}
                        </div>
                    </div>
                `;
                
                // 核心加固：使用 textContent 
                item.querySelector('.m-row-text').textContent = modalText;

                const detailBtn = item.querySelector('.m-view-btn');
                item.onmouseenter = () => detailBtn.style.opacity = '1';
                item.onmouseleave = () => detailBtn.style.opacity = '0';

                detailBtn.onclick = (e) => {
                    e.stopPropagation();
                    showFullText(modalText, `${displayLabel}全文`);
                };

                listBox.appendChild(item);
            });

            function showFullText(txt, title) {
                const subOverlay = document.createElement('div');
                subOverlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:1000000;display:flex;align-items:center;justify-content:center;`;
                const subModal = document.createElement('div');
                subModal.style.cssText = `background:#fff;width:80%;max-width:600px;max-height:80vh;border-radius:12px;padding:24px;display:flex;flex-direction:column;box-shadow:0 10px 30px rgba(0,0,0,0.2);`;
                subModal.innerHTML = `
                    <div style="display:flex;justify-content:space-between;margin-bottom:15px;align-items:center;"><h4 style="margin:0">${title}</h4><button id="sub-x" style="border:none;background:none;font-size:22px;cursor:pointer;">&times;</button></div>
                    <div id="sub-body" style="flex:1;overflow-y:auto;font-size:14px;line-height:1.6;color:#333;white-space:pre-wrap;padding-top:10px;border-top:1px solid #eee;"></div>
                `;
                subModal.querySelector('#sub-body').textContent = txt;
                subOverlay.onclick = (e) => { if(e.target === subOverlay) document.body.removeChild(subOverlay); };
                subModal.querySelector('#sub-x').onclick = () => document.body.removeChild(subOverlay);
                subOverlay.appendChild(subModal);
                document.body.appendChild(subOverlay);
            }

            const upCount = () => modal.querySelector('#m-count-view').innerText = modal.querySelectorAll('.m-row-ck:checked').length;
            modal.querySelectorAll('.m-row-ck').forEach(c => c.onchange = upCount);
            
            modal.querySelector('#m-all').onclick = () => { modal.querySelectorAll('.m-row-ck').forEach(c => c.checked = true); upCount(); };
            modal.querySelector('#m-none').onclick = () => { modal.querySelectorAll('.m-row-ck').forEach(c => c.checked = false); upCount(); };
            modal.querySelector('#m-ans').onclick = () => { 
                allMsgs.forEach((m, i) => modal.querySelector(`.m-row-ck[data-i="${i}"]`).checked = (m.role === 'assistant'));
                upCount();
            };
            
            if (isDeepSeek && modal.querySelector('#m-no-thought')) {
                modal.querySelector('#m-no-thought').onclick = () => {
                    allMsgs.forEach((m, i) => {
                        if (m.isThought) modal.querySelector(`.m-row-ck[data-i="${i}"]`).checked = false;
                    });
                    upCount();
                };
            }

            modal.querySelector('#modal-x').onclick = closeModal;

            modal.querySelectorAll('.m-ex-btn').forEach(b => b.onclick = () => {
                const picked = Array.from(modal.querySelectorAll('.m-row-ck:checked')).map(c => allMsgs[parseInt(c.getAttribute('data-i'))]);
                if (!picked.length) return alert('请至少选择一项');
                handleExport(picked, b.getAttribute('data-f'));
            });
        }

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = popup.style.opacity === '1';
            
            if (isVisible) {
                popup.style.opacity = '0';
                popup.style.pointerEvents = 'none';
                popup.style.transform = 'translateY(10px) scale(0.95)';
            } else {
                const rect = btn.getBoundingClientRect();
                popup.style.left = (rect.left - 180) + 'px';
                popup.style.top = (rect.bottom + 10) + 'px';
                popup.style.opacity = '1';
                popup.style.pointerEvents = 'auto';
                popup.style.transform = 'translateY(0) scale(1)';
            }
        });

        document.addEventListener('click', () => {
            popup.style.opacity = '0';
            popup.style.pointerEvents = 'none';
            popup.style.transform = 'translateY(10px) scale(0.95)';
        });

        // 收起逻辑实现
        function applyAutoCollapse() {
            if (!isQwen || !autoCollapse) return;
            // 使用用户提供的 ID 准确定位侧边栏
            const sidebar = document.querySelector("#new-nav-tab-wrapper");
            if (sidebar) {
                // 判断是否处于展开状态（没有 !w-0 类名即为展开）
                const isExpanded = !sidebar.classList.contains('!w-0');
                if (isExpanded) {
                    // 准确定位侧边的收起按钮（依据 data-icon-type="qwpcicon-sidebarLeft"）
                    const icon = sidebar.querySelector('span[data-icon-type="qwpcicon-sidebarLeft"]');
                    const toggleBtn = icon ? icon.closest('button') : null;
                    
                    if (toggleBtn) {
                        toggleBtn.click();
                    } else {
                        // 强制注入样式（备用）
                        sidebar.classList.add('!w-0', 'basis-0', '!min-w-0');
                    }
                }
            }
        }

        const DEEPSEEK_ANCHOR_PATH_D = 'M7.95889 1.52285C7.95888 0.826234 8.76055 0.467983 9.27669 0.875208L9.37524 0.967191L15.1317 7.18358C15.5582 7.64419 15.5582 8.35614 15.1317 8.81676L9.37524 15.0331C8.87034 15.578 7.95888 15.2205 7.95889 14.4775V10.8207C7.10614 10.8432 6.31361 10.9316 5.45468 11.2515C4.39484 11.6463 3.18248 12.413 1.64676 13.9425C1.4533 14.135 1.18329 14.1696 0.969086 14.0908C0.74748 14.0091 0.547307 13.7879 0.54859 13.4844L0.55516 13.1315C0.618924 11.3494 1.11153 9.29838 2.27656 7.63787C3.45289 5.96147 5.29554 4.71635 7.95889 4.54797V1.52285ZM9.20911 5.13366C9.20899 5.50567 8.9031 5.77687 8.56523 5.77755C5.99383 5.78282 4.33736 6.8762 3.29964 8.35496C2.54519 9.43014 2.10739 10.7283 1.9152 11.9939C3.04749 11.0323 4.0569 10.4385 5.01917 10.0801C6.29638 9.60449 7.4406 9.56343 8.56429 9.56295C8.9178 9.5628 9.20894 9.84909 9.20911 10.2068L9.20817 13.3737L14.1837 8.00017L9.20817 2.62571L9.20911 5.13366Z';

        function normalizeSvgPathD(d) {
            return (d || '').replace(/\s+/g, ' ').trim();
        }

        function isElementVisiblyRenderable(el) {
            if (!el || !el.isConnected) return false;
            const rect = el.getBoundingClientRect();
            if (rect.width <= 0 || rect.height <= 0) return false;
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
        }

        function findDeepSeekHeaderAnchor() {
            const targetD = normalizeSvgPathD(DEEPSEEK_ANCHOR_PATH_D);

            // 先全局匹配目标 path，再按“顶部右侧工具栏”特征打分，避免依赖混淆类名。
            const candidates = Array.from(document.querySelectorAll('svg path'))
                .filter(p => normalizeSvgPathD(p.getAttribute('d')) === targetD)
                .map(p => p.closest('div[role="button"], button, .ds-icon-button, .ds-icon-button--sizing-container'))
                .filter(Boolean)
                .filter(el => !el.classList.contains('ai-nodes-settings-btn'))
                .filter(el => isElementVisiblyRenderable(el));

            if (candidates.length) {
                let best = null;
                let bestScore = -Infinity;
                candidates.forEach((el) => {
                    const rect = el.getBoundingClientRect();
                    let score = 0;

                    // 标题栏按钮通常位于页面上部且偏右。
                    if (rect.top >= -20 && rect.top <= 220) score += 120;
                    if (rect.left >= window.innerWidth * 0.45) score += 40;

                    const cls = String(el.className || '');
                    if (cls.includes('ds-icon-button--xl') || cls.includes('ds-icon-button--l')) score += 20;

                    if (el.closest('[class*="_0efe408"], [class*="_2be88ba"], [class*="a02af2e6"]')) score += 30;

                    // 降权消息区/历史区同款图标按钮。
                    if (el.closest('[data-virtual-list-item-key], .ds-message, [class*="_77cdc67"], [class*="_3098d02"], [class*="_254829d"]')) score -= 200;

                    if (score > bestScore) {
                        bestScore = score;
                        best = el;
                    }
                });

                if (best && bestScore > -50) return best;
            }

            // 最后兜底：仍优先尝试常见顶栏容器。
            const topbar = document.querySelector('div[class*="_2be88ba"] div[class*="_0efe408"]') ||
                           document.querySelector('div[class*="_0efe408"]') ||
                           document.querySelector('.dc04ec1d.a02af2e6 div[class*="_0efe408"]');
            if (!topbar) return null;
            const fallbacks = Array.from(topbar.querySelectorAll('div[role="button"].ds-icon-button--sizing-container, .ds-icon-button.ds-icon-button--sizing-container'))
                .filter(el => !el.classList.contains('ai-nodes-settings-btn'));
            return fallbacks[fallbacks.length - 1] || null;
        }

        function ensureDeepSeekPlacement() {
            if (!isDeepSeek) return false;
            const anchor = findDeepSeekHeaderAnchor();
            if (!anchor || !anchor.parentElement) return false;
            if (anchor === btn) return false;
            const container = anchor.parentElement;

            if (btn.parentElement !== container) {
                container.insertBefore(btn, anchor);
                return true;
            }

            // 已在目标容器内，但顺序不正确时强制纠正到锚点前
            if (btn.nextSibling !== anchor) {
                container.insertBefore(btn, anchor);
                return true;
            }
            return true;
        }

        // 注入逻辑
        function attemptInjection() {
            let container = null;
            if (isChatGPT) {
                container = document.querySelector("#page-header > div.flex.items-center.justify-center.gap-3.overflow-x-hidden > div.flex.items-center.justify-end.overflow-x-hidden");
                // 核心修复：强制隐藏 GPT 容器的垂直滚动条
                if (container) container.style.setProperty('overflow-y', 'hidden', 'important');
            } else if (isQwen) {
                // 更新千问注入位置为顶栏右侧功能区
                container = document.querySelector(".flex.items-center.gap-2.mr-4.desktop-no-drag > div.flex.items-center.gap-2");
            } else if (isDoubao) {
                // 豆包注入位置：优先插到分享按钮前，避免附加到不稳定容器末尾
                const shareEl = document.querySelector('[data-testid="thread_share_btn_right_side"]');
                const shareAnchor = shareEl ? (shareEl.closest('button') || shareEl.closest('div') || shareEl) : null;
                const shareContainer = shareAnchor && shareAnchor.parentElement;
                if (shareContainer && !shareContainer.querySelector('.ai-nodes-settings-btn')) {
                    shareContainer.insertBefore(btn, shareAnchor);
                    setTimeout(applyAutoCollapse, 500);
                    return true;
                }

                // 兜底：匹配头部右侧操作区，再兜底到 chat_header 本体
                container = document.querySelector('[data-testid="chat_header"] [class*="right"], [data-testid="chat_header"] [class*="action"], [data-testid="chat_header"] [class*="toolbar"]') ||
                            document.querySelector('[data-testid="chat_header"] [class*="container-"]') ||
                            document.querySelector('[data-testid="chat_header"]') ||
                            document.querySelector('header');
            } else if (isDeepSeek) {
                // DeepSeek 注入位置：优先锚定头部功能按钮，避免插到正文区域
                if (ensureDeepSeekPlacement()) {
                    setTimeout(applyAutoCollapse, 500);
                    return true;
                }
                // 备选方案
                container = document.querySelector('div[class*="_2be88ba"] div[class*="_0efe408"]') ||
                            document.querySelector('div[class*="_0efe408"]') ||
                            document.querySelector('.dc04ec1d.a02af2e6 > div:last-child') ||
                            document.querySelector('.dc04ec1d.a02af2e6');
            }

            if (container && !container.querySelector('.ai-nodes-settings-btn')) {
                container.appendChild(btn);
                // 首次注入成功时尝试自动收起
                setTimeout(applyAutoCollapse, 500);
                return true;
            }
            return false;
        }

        // 尝试注入，由于 SPA 异步渲染，需要轮询几次
        let attempts = 0;
        const interval = setInterval(() => {
            if (attemptInjection() || attempts > 20) {
                clearInterval(interval);
            }
            attempts++;
        }, 1000);

        // 长驻守护：路由切换或头部重渲染后自动补注入
        const ensureInjected = () => {
            if (isDeepSeek) {
                // DeepSeek 头部经常局部重渲染，即使按钮仍连接也可能位置错乱
                if (!ensureDeepSeekPlacement() && !btn.isConnected) {
                    attemptInjection();
                }
                return;
            }

            if (!btn.isConnected) {
                attemptInjection();
            }
        };

        let ensureTimer = null;
        const scheduleEnsureInjected = () => {
            if (ensureTimer) return;
            ensureTimer = setTimeout(() => {
                ensureTimer = null;
                ensureInjected();
            }, isDeepSeek ? 180 : 0);
        };

        const mo = new MutationObserver(() => {
            scheduleEnsureInjected();
        });
        mo.observe(document.body, { childList: true, subtree: true });

        window.addEventListener('popstate', () => setTimeout(ensureInjected, 200));
        window.addEventListener('hashchange', () => setTimeout(ensureInjected, 200));
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) setTimeout(ensureInjected, 100);
        });
    }

    init();
    injectSettings();
})();
