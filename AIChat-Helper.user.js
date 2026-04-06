// ==UserScript==
// @name         AI对话助手
// @namespace    http://tampermonkey.net/
// @version      2.0.2
// @description  支持 ChatGPT、通义千问、豆包、DeepSeek：自动生成对话节点导航、一键导出对话（PDF/Markdown/JSON/CSV/TXT）。
// @author       xchengb
// @updateURL    https://gitee.com/xcb157342/ai-chat-nodes/raw/master/AIChat-Helper.user.js
// @downloadURL  https://gitee.com/xcb157342/ai-chat-nodes/raw/master/AIChat-Helper.user.js
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDMyIDMyIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIGZpbGw9Im5vbmUiLz48cGF0aCBmaWxsPSIjMDQwMGU2IiBkPSJNMTYgMTlhNi45OSAxNi45OSAwIDAgMS01LjgzMy0zLjEyOWwxLjY2Ni0xLjEwN2E1IDUgMCAwIDAgOC4zMzQgMGwxLjY2NiAxLjEwN0E2Ljk5IDYuOTkgMCAwIDEgMTYgMTl6Ii8+PGNpcmNsZSBjeD0iMjAyMCIgY3k9IjEwIiByPSIyIiBmaWxsPSIjMDQwMGU2Ii8+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMCIgcj0iMiIgZmlsbD0iIzA0MDBlNiIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTAiIHI9IjIiIGZpbGw9IiMwNDAwZTYiLz48Y2lyY2xlIGN4PSIxMiIgY3k9IjEwIiByPSIyIiBmaWxsPSIjMDQwMGU2Ii8+PHBhdGggZmlsbD0iIzA0MDBlNiIgZD0iTTE3LjczNiAzMEwxNiAyOWw0LTdoNmEyIDIgMCAwIDAgMi0yVjZhMiAyIDAgMCAwLTItMkg2YTIgMiAwIDAgMC0yIDJ2MTRhMiAyIDAgMCAwIDIgMmg5djJINmE0IDQgMCAwIDEtNC00VjZhNCA0IDAgMCAxIDQtNGgyMGE0IDQgMCAwIDEgNCA0djE0YTQgNCAwIDAgMS00IDRoLTQuODM1eiIvPjwvc3ZnPg==
// @match        *://chatgpt.com/*
// @match        *://www.qianwen.com/*
// @match        *://www.doubao.com/chat*
// @match        *://chat.deepseek.com/*
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const host = window.location.hostname;
    const pathname = window.location.pathname;

    const isChatGPTHost = /(^|\.)chatgpt\.com$/i.test(host);
    const isQwenHost = /^www\.qianwen\.com$/i.test(host);
    const isDoubaoHost = /^www\.doubao\.com$/i.test(host);
    const isDeepSeekHost = /^chat\.deepseek\.com$/i.test(host);

    const isChatGPTPath = /^\/(?:$|c\/[a-z0-9-]+\/?)$/i.test(pathname);
    const isQwenPath = /^\/(?:$|chat(?:\/[a-z0-9_-]{8,})?\/?)$/i.test(pathname);
    const isDoubaoPath = /^\/chat(?:\/\d+)?\/?$/i.test(pathname);
    const isDeepSeekPath = /^\/(?:$|a\/chat\/s(?:\/[0-9a-f-]{36})?\/?|chat(?:\/[0-9a-f-]{36})?\/?)$/i.test(pathname);

    const isChatGPT = isChatGPTHost && isChatGPTPath;
    const isQwen = isQwenHost && isQwenPath;
    const isDoubao = isDoubaoHost && isDoubaoPath;
    const isDeepSeek = isDeepSeekHost && isDeepSeekPath;
    const AI_NAME = isChatGPT ? 'ChatGPT' : (isDeepSeek ? 'DeepSeek' : (isDoubao ? '豆包' : (isQwen ? '通义千问' : 'AI 助手')));

    if (!isChatGPT && !isQwen && !isDoubao && !isDeepSeek) return;

    function getPlatformIconUrl() {
        const iconEl = document.querySelector('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"], link[rel*="icon"]');
        const href = iconEl?.href || iconEl?.getAttribute('href') || '';
        if (href) {
            try {
                return new URL(href, window.location.origin).href;
            } catch (_) {}
        }
        if (isChatGPT) return 'https://chatgpt.com/favicon.ico';
        if (isQwen) return 'https://www.qianwen.com/favicon.ico';
        if (isDoubao) return 'https://www.doubao.com/favicon.ico';
        if (isDeepSeek) return 'https://chat.deepseek.com/favicon.ico';
        return `${window.location.origin}/favicon.ico`;
    }

    let nodes = [];
    let nodesMap = new Map(); // 用于持久化记录节点，防止虚拟列表回收导致消失
    let lastCount = 0;
    let currentConvId = '';
    let storageKey = '';
    const COLLAPSE_KEY = 'ai-nodes-auto-collapse-qwen';
    const ADS_KEY = 'ai-nodes-remove-qwen-ads';
    const QWEN_GLASS_POPUPS_KEY = 'ai-nodes-qwen-glass-popups';
    const DEEPSEEK_NATIVE_NAV_KEY = 'ai-nodes-hide-deepseek-native-nav';
    const DOUBAO_GLASS_POPUPS_KEY = 'ai-nodes-doubao-glass-popups';
    const DOT_GAP_KEY = 'ai-nodes-dot-gap';
    const VISIBLE_LIMIT_KEY = 'ai-nodes-visible-limit';
    const READING_LINE_KEY = 'ai-nodes-reading-line';

    const getGlobalValue = (key, defaultValue) => {
        let val;
        try {
            if (typeof GM_getValue === 'function') {
                val = GM_getValue(key);
            } else {
                val = localStorage.getItem(key);
            }
        } catch (e) {
            val = localStorage.getItem(key);
        }
        if (val === null || val === undefined) return defaultValue;
        if (typeof defaultValue === 'boolean') return String(val) === 'true';
        if (typeof defaultValue === 'number') return Number(val);
        return val;
    };

    const setGlobalValue = (key, value) => {
        try {
            if (typeof GM_setValue === 'function') {
                GM_setValue(key, value);
            }
        } catch (e) {}
        localStorage.setItem(key, String(value));
    };
    
    let isHistoryFullyLoaded = false; // 用户要求的缓存机制：标记当前对话历史是否已全量加载过
    let activeNodeId = null; // 存储 ID 而非 DOM 引用，防止重绘后状态失效
    let searchIntervalId = null; // 独立计时器驱动的自动搜寻 ID
    let isNodeSearching = false;
    let orbitalScrollOffset = 0;
    let orbitalTargetScrollOffset = 0;
    let orbitalAnimationFrame = 0;
    let orbitalAnimFrom = 0;
    let orbitalAnimTo = 0;
    let orbitalAnimStartAt = 0;
    let orbitalAnimDuration = 220;
    let orbitalLastRenderedOffset = NaN;
    let orbitalLastInteractionAt = 0;
    let qwenInitUnlockInProgress = false;
    let qwenVirtualNodesCache = [];
    let qwenVirtualNodesSessionId = '';
    let qwenVirtualNodesLoading = false;
    let qwenVirtualNodesLoaded = false;
    let qwenVirtualNodesLastFetchAt = 0;
    let qwenVirtualNodesDirty = true;
    let qwenPendingDomNodes = [];
    let qwenDomMutationDebounceTimer = null;
    let qwenAutoApiRefreshTimer = null;
    let qwenAutoApiRefreshInFlight = false;
    let qwenLastAutoApiRefreshAt = 0;
    let qwenLastUpdateDebugSig = '';
    let qwenEmptyRetryTimer = null;
    let qwenHistoryHydrationInFlight = false;
    let qwenLastHydratedSessionId = '';
    let qwenLastHydrationSignature = '';
    let qwenCapturedTemplate = null;
    let qwenEarlyCaptureHooksInstalled = false;
    let qwenCaptureHooksInstalled = false;
    let qwenPendingApiPayloads = [];
    let qwenInternalFetchDepth = 0;
    let qwenSuppressCapturedPayloads = 0;
    let qwenInternalRequestMarks = new Map();
    let qwenNavJumpSeq = 0;
    let doubaoNavJumpSeq = 0;
    let deepseekNavJumpSeq = 0;
    let deepseekVirtualNodesCache = [];
    let deepseekVirtualNodesLoading = false;
    let deepseekVirtualNodesLoaded = false;
    let deepseekVirtualNodesLastFetchAt = 0;
    let deepseekDomNodesSnapshot = [];
    let doubaoVirtualNodesCache = [];
    let doubaoVirtualNodesLoading = false;
    let doubaoVirtualNodesLoaded = false;
    let doubaoVirtualNodesLastFetchAt = 0;
    let doubaoVirtualNodesDirty = true;
    let doubaoPendingDomNodes = [];
    let doubaoDomMutationDebounceTimer = null;
    let doubaoAutoApiRefreshTimer = null;
    let doubaoAutoApiRefreshInFlight = false;
    let doubaoLastAutoApiRefreshAt = 0;
    let doubaoLastDomUserSignature = '';
    let doubaoInitialFetchConvId = '';
    let doubaoBootClickedConvId = '';
    const DOUBAO_QUERY_DEFAULTS = 'version_code=20800&language=zh&device_platform=web&aid=497858&real_aid=497858&pkg_type=release_version&device_id=7571732726702835209&pc_version=3.12.3&web_id=7572300776296236571&tea_uuid=7572300776296236571&region=CN&sys_region=CN&samantha_web=1&use-olympus-account=1';
    const DOUBAO_FULL_FETCH_MAX_PAGES = 200;
    let doubaoCapturedTemplate = null;
    let doubaoCapturedRecentConvUrl = '';
    let doubaoCapturedRecentConvBodyText = '';
    let doubaoCapturedMcsListRequest = null;
    let doubaoCaptureHooksInstalled = false;
    let doubaoArtifactContentCache = new Map();
    let deepseekCapturedHeaders = null;
    let deepseekPageListTemplate = null;
    let deepseekCaptureHooksInstalled = false;
    let deepseekLastSessionMeta = null;
    let chatgptAccessToken = null;
    const chatgptCapturedWorkspaceIds = new Set();
    const chatgptCapturedDeviceIds = new Set();
    const DEEPSEEK_PAGE_LIST_PATH = '/api/v0/chat_session/fetch_page';
    const DEEPSEEK_HISTORY_PATH = '/api/v0/chat/history_messages';
    const CHATGPT_BATCH_PAGE_LIMIT = 100;
    const QWEN_NODE_DEBUG = false;

    // 先放占位实现，避免页面初始阶段因执行时序触发 ReferenceError。
    let installQwenCaptureHooks = function () {
        return;
    };

    let getQwenMessagesByApi = async function () {
        return [];
    };

    let collectQwenMessagesFromPendingPayloads = function () {
        return [];
    };

    // 豆包同样提供占位，避免初始化阶段被提前调用时报 ReferenceError。
    let installDoubaoCaptureHooks = function () {
        return;
    };

    let getDoubaoMessagesByApi = async function () {
        return [];
    };

    // 早期辅助函数：给顶部刷新链/切换保护使用，避免后续实现尚未进入当前作用域时触发 ReferenceError。
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

    function queueQwenPendingApiPayload(url, rawText, source) {
        if (!url || !rawText) return;
        if (qwenInternalFetchDepth > 0) return;
        if (qwenSuppressCapturedPayloads > 0) {
            qwenNodeLog('pending:skip-suppressed', { source, url, suppressDepth: qwenSuppressCapturedPayloads });
            return;
        }
        if (isMarkedQwenInternalRequest(url)) {
            qwenNodeLog('pending:skip-internal', { source, url });
            return;
        }
        try {
            const payloadUrl = new URL(url, window.location.origin);
            const payloadSessionId = String(payloadUrl.searchParams.get('session_id') || '').trim();
            const currentUrl = new URL(window.location.href);
            const currentSessionId = String(currentUrl.searchParams.get('session_id') || '').trim();
            if (payloadSessionId && currentSessionId && payloadSessionId !== currentSessionId) {
                qwenNodeLog('pending:skip-stale', { source, payloadSessionId, currentSessionId });
                return;
            }
        } catch (e) {
            // ignore session parse errors
        }
        qwenPendingApiPayloads.push({ url, rawText, source });
        qwenNodeLog('pending:push', { source, url, size: qwenPendingApiPayloads.length });
        qwenVirtualNodesDirty = true;

        setTimeout(() => {
            if (!isQwen) return;
            const changed = flushQwenPendingApiPayloads();
            if (changed) {
                maybeHydrateQwenHistory(source || 'pending-push');
                return;
            }
            scheduleQwenVirtualNodesRefresh(true);
        }, 0);
    }

    function installEarlyQwenCaptureHook() {
        if (!isQwen || qwenEarlyCaptureHooksInstalled) return;
        qwenEarlyCaptureHooksInstalled = true;

        const isMsgListUrl = (rawUrl) => {
            try {
                const u = new URL(rawUrl, window.location.origin);
                return u.pathname.includes('/api/v1/session/msg/list');
            } catch (e) {
                return false;
            }
        };

        const simpleParseHeaders = (headersLike) => {
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
        };

        const nativeFetch = window.fetch;
        window.fetch = function (input, init) {
            const resp = nativeFetch.apply(this, arguments);
            try {
                const url = typeof input === 'string' ? input : input?.url;
                if (url && isMsgListUrl(url)) {
                    qwenCapturedTemplate = {
                        url,
                        method: String(init?.method || input?.method || 'GET').toUpperCase(),
                        headers: simpleParseHeaders(init?.headers || input?.headers),
                        body: typeof (init?.body) === 'string' ? init.body : ''
                    };

                    Promise.resolve(resp).then((r) => {
                        if (!r || !r.ok || typeof r.clone !== 'function') return;
                        return r.clone().text().then((rawText) => {
                            queueQwenPendingApiPayload(url, rawText, 'early-fetch');
                        }).catch(() => {});
                    }).catch(() => {});
                }
            } catch (e) {
                // ignore early hook errors
            }
            return resp;
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
                if (this.__aiNodesQwenUrl && isMsgListUrl(this.__aiNodesQwenUrl)) {
                    qwenCapturedTemplate = {
                        url: this.__aiNodesQwenUrl,
                        method: this.__aiNodesQwenMethod || 'GET',
                        headers: this.__aiNodesQwenHeaders || {},
                        body: typeof body === 'string' ? body : ''
                    };
                    this.addEventListener('load', () => {
                        try {
                            if (this.status < 200 || this.status >= 300) return;
                            const rawText = typeof this.responseText === 'string' ? this.responseText : '';
                            queueQwenPendingApiPayload(this.__aiNodesQwenUrl, rawText, 'early-xhr');
                        } catch (e) {
                            // ignore
                        }
                    }, { once: true });
                }
            } catch (e) {
                // ignore early hook errors
            }
            return nativeSend.apply(this, arguments);
        };
    }

    installEarlyQwenCaptureHook();

    function qwenNodeLog(stage, payload) {
        if (!isQwen || !QWEN_NODE_DEBUG) return;
        try {
            if (payload === undefined) console.log(`[AI-Chat-Helper][Qwen] ${stage}`);
            else console.log(`[AI-Chat-Helper][Qwen] ${stage}`, payload);
        } catch (e) {
            // ignore debug log errors
        }
    }

    function captureChatGPTHeaderValue(name, value) {
        if (!isChatGPT || !name || value == null || value === '') return;
        const lower = String(name).toLowerCase();
        const rawValue = String(value).trim();
        if (!rawValue) return;

        if (lower === 'authorization' && /^bearer\s+/i.test(rawValue)) {
            const token = rawValue.replace(/^bearer\s+/i, '').trim();
            if (token) chatgptAccessToken = token;
            return;
        }

        if (lower === 'chatgpt-account-id') {
            chatgptCapturedWorkspaceIds.add(rawValue);
            return;
        }

        if (lower === 'oai-device-id') {
            chatgptCapturedDeviceIds.add(rawValue);
        }
    }

    function captureChatGPTHeaders(headersLike) {
        if (!isChatGPT || !headersLike) return;

        if (typeof headersLike === 'string') {
            captureChatGPTHeaderValue('authorization', headersLike);
            return;
        }

        if (headersLike instanceof Headers) {
            headersLike.forEach((value, name) => captureChatGPTHeaderValue(name, value));
            return;
        }

        if (Array.isArray(headersLike)) {
            headersLike.forEach((entry) => {
                if (!Array.isArray(entry) || entry.length < 2) return;
                captureChatGPTHeaderValue(entry[0], entry[1]);
            });
            return;
        }

        if (typeof headersLike === 'object') {
            Object.entries(headersLike).forEach(([name, value]) => captureChatGPTHeaderValue(name, value));
        }
    }

    function installChatGPTCaptureHooks() {
        if (!isChatGPT || window.__aiNodesChatGPTCaptureInstalled) return;
        window.__aiNodesChatGPTCaptureInstalled = true;

        const nativeFetch = window.fetch;
        window.fetch = function (input, init) {
            try {
                captureChatGPTHeaders(init?.headers);
                if (input && typeof input === 'object') captureChatGPTHeaders(input.headers);
            } catch (e) {
                // ignore capture errors
            }
            return nativeFetch.apply(this, arguments);
        };

        const rawOpen = XMLHttpRequest.prototype.open;
        const rawSetHeader = XMLHttpRequest.prototype.setRequestHeader;

        XMLHttpRequest.prototype.open = function (method, url) {
            this.__aiNodesChatGPTHeaders = {};
            return rawOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
            try {
                if (this.__aiNodesChatGPTHeaders && name) {
                    this.__aiNodesChatGPTHeaders[String(name)] = String(value);
                }
                captureChatGPTHeaderValue(name, value);
            } catch (e) {
                // ignore capture errors
            }
            return rawSetHeader.apply(this, arguments);
        };
    }

    installChatGPTCaptureHooks();

    function cleanupQwenInternalRequestMarks() {
        if (!qwenInternalRequestMarks.size) return;
        const now = Date.now();
        Array.from(qwenInternalRequestMarks.entries()).forEach(([url, expiresAt]) => {
            if (!expiresAt || expiresAt <= now) qwenInternalRequestMarks.delete(url);
        });
    }

    function markQwenInternalRequest(url, ttlMs = 15000) {
        if (!url) return;
        cleanupQwenInternalRequestMarks();
        qwenInternalRequestMarks.set(String(url), Date.now() + Math.max(1000, ttlMs));
    }

    function isMarkedQwenInternalRequest(url) {
        if (!url) return false;
        cleanupQwenInternalRequestMarks();
        const expiresAt = qwenInternalRequestMarks.get(String(url));
        return Boolean(expiresAt && expiresAt > Date.now());
    }

    function getConvId() {
        if (isDeepSeek) {
            const fromRoute = getDeepSeekSessionIdFromLocation();
            if (isLikelyUuid(fromRoute)) return fromRoute;

            const fromLinks = getDeepSeekSessionIdFromLinks();
            if (isLikelyUuid(fromLinks)) return fromLinks;

            const fromStorage = sessionStorage.getItem('deepseek_api_test_last_session_id')
                || localStorage.getItem('deepseek_api_test_last_session_id')
                || '';
            if (isLikelyUuid(fromStorage)) return fromStorage;
        }

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
            activeNodeId = null;
            if (isQwen) {
                qwenInitUnlockInProgress = false;
                try {
                    sessionStorage.removeItem(`ai-nodes-qwen-init-unlock-${currentConvId}`);
                } catch (e) {
                    // ignore
                }
                qwenVirtualNodesCache = [];
                qwenPendingApiPayloads = [];
                qwenVirtualNodesSessionId = '';
                qwenVirtualNodesLoading = false;
                qwenVirtualNodesLoaded = false;
                qwenVirtualNodesLastFetchAt = 0;
                qwenPendingDomNodes = [];
                if (qwenDomMutationDebounceTimer) {
                    clearTimeout(qwenDomMutationDebounceTimer);
                    qwenDomMutationDebounceTimer = null;
                }
                if (qwenAutoApiRefreshTimer) {
                    clearTimeout(qwenAutoApiRefreshTimer);
                    qwenAutoApiRefreshTimer = null;
                }
                qwenAutoApiRefreshInFlight = false;
                qwenLastAutoApiRefreshAt = 0;
                qwenSuppressCapturedPayloads = 0;
                qwenInternalRequestMarks.clear();
                qwenVirtualNodesDirty = true;
                qwenHistoryHydrationInFlight = false;
                qwenLastHydratedSessionId = '';
                qwenLastHydrationSignature = '';
                qwenLastUpdateDebugSig = '';
                if (qwenEmptyRetryTimer) {
                    clearTimeout(qwenEmptyRetryTimer);
                    qwenEmptyRetryTimer = null;
                }
            }
            if (isDeepSeek) {
                deepseekVirtualNodesCache = [];
                deepseekVirtualNodesLoaded = false;
                deepseekVirtualNodesLastFetchAt = 0;
                deepseekDomNodesSnapshot = [];
                deepseekPageListTemplate = null;
                deepseekLastSessionMeta = null;
            }
            if (isDoubao) {
                doubaoVirtualNodesCache = [];
                doubaoVirtualNodesLoading = false;
                doubaoVirtualNodesLoaded = false;
                doubaoVirtualNodesLastFetchAt = 0;
                doubaoVirtualNodesDirty = true;
                doubaoPendingDomNodes = [];
                if (doubaoDomMutationDebounceTimer) {
                    clearTimeout(doubaoDomMutationDebounceTimer);
                    doubaoDomMutationDebounceTimer = null;
                }
                if (doubaoAutoApiRefreshTimer) {
                    clearTimeout(doubaoAutoApiRefreshTimer);
                    doubaoAutoApiRefreshTimer = null;
                }
                doubaoAutoApiRefreshInFlight = false;
                doubaoLastAutoApiRefreshAt = 0;
                doubaoLastDomUserSignature = '';
                doubaoInitialFetchConvId = '';
                doubaoBootClickedConvId = '';
                doubaoNavJumpSeq = 0;
            }
            return true;
        }
        return false;
    }
    
    updateStorageKey();
    
    let ticking = false;
    let autoCollapse = getGlobalValue(COLLAPSE_KEY, false);
    let removeAds = getGlobalValue(ADS_KEY, false);
    let qwenGlassPopups = getGlobalValue(QWEN_GLASS_POPUPS_KEY, true);
    let hideDeepSeekNativeNav = getGlobalValue(DEEPSEEK_NATIVE_NAV_KEY, false);
    let doubaoGlassPopups = getGlobalValue(DOUBAO_GLASS_POPUPS_KEY, true);

    const CONFIG = {
        topGap: 80,
        bottomGap: 24,
        right: 10,
        panelWidth: 80,
        scrollWidth: 64,
        trackWidth: 4,
        dotSize: 11,
        dotBorder: 2,
        dotGap: Math.max(20, Math.min(50, getGlobalValue(DOT_GAP_KEY, 36))),
        maxVisibleDotsBeforeScroll: getGlobalValue(VISIBLE_LIMIT_KEY, 12),
        readingLineOffset: Math.max(10, Math.min(500, getGlobalValue(READING_LINE_KEY, 150))),
        maxTrackViewportRatio: 0.4
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
        z-index: 10140;
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
    if (document.body) document.body.appendChild(globalTooltip);

    // ===== 最外层固定容器 =====
    const container = document.createElement('div');
    container.id = 'ai-nodes-nav-wrapper';
    container.className = 'ai-nodes-nav-wrapper';
    container.style.position = 'fixed';
    container.style.right = CONFIG.right + 'px';
    container.style.top = CONFIG.topGap + 'px';
    container.style.width = CONFIG.panelWidth + 'px';
    container.style.height = 'auto';
    container.style.maxHeight = `calc(100vh - ${CONFIG.topGap + CONFIG.bottomGap}px)`;
    container.style.zIndex = '10110';
    container.style.pointerEvents = 'auto';
    container.style.overflow = 'visible';
    container.style.display = 'flex';
    container.style.visibility = 'visible';
    container.style.opacity = '1';
    container.style.alignItems = 'center';
    container.style.flexDirection = 'column';
    container.style.paddingTop = '10px';
    if (document.body) document.body.appendChild(container);


    // ===== 滚动条样式优化 =====
    const styleTag = document.createElement('style');
    styleTag.innerHTML = `
        .ai-navigator-scroll::-webkit-scrollbar {
            width: 0;
            height: 0;
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
        .ai-navigator-scroll {
            scrollbar-width: none;
            -ms-overflow-style: none;
        }
        /* 千问去广告样式 */
        body.ai-nodes-hide-ads [data-c="result_card"],
        body.ai-nodes-hide-ads [class*="card_card_video"],
        body.ai-nodes-hide-ads [data-tpl*="card_video"],
        body.ai-nodes-hide-ads [class*="video_note_list"],
        body.ai-nodes-hide-ads [class*="container-3D4Pp"] {
            display: none !important;
        }
        /* DeepSeek 原生节点导航隐藏 */
        body.ai-nodes-hide-deepseek-native-nav ._189b4a0,
        body.ai-nodes-hide-deepseek-native-nav ._189b4a0:has(.ds-virtual-list),
        body.ai-nodes-hide-deepseek-native-nav ._189b4a0 .ds-virtual-list {
            display: none !important;
        }
        /* 豆包输入框弹层卡片玻璃背景（更多/附件/快速-思考-专家） */
        body.ai-nodes-doubao-glass-popups [data-radix-popper-content-wrapper] [data-slot="dropdown-menu-content"]:has(input[data-testid="upload-file-input"]),
        body.ai-nodes-doubao-glass-popups [data-radix-popper-content-wrapper] [data-slot="dropdown-menu-content"]:has([data-testid="upload_file_panel_upload_item"]),
        body.ai-nodes-doubao-glass-popups [data-radix-popper-content-wrapper] [data-slot="dropdown-menu-content"]:has([data-testid^="deep-thinking-action-item-"]),
        body.ai-nodes-doubao-glass-popups [data-radix-popper-content-wrapper] [role="dialog"]:has([data-testid^="skill_bar_button_"]) {
            background: rgba(255, 255, 255, 0.5) !important;
            backdrop-filter: blur(10px) saturate(118%) !important;
            -webkit-backdrop-filter: blur(10px) saturate(118%) !important;
            border: 1px solid rgba(255, 255, 255, 0.34) !important;
            box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.36) !important;
        }
        /* 千问输入框弹层卡片玻璃背景 */
        body.ai-nodes-qwen-glass-popups [data-radix-popper-content-wrapper] [role="menu"][data-radix-menu-content]:has([data-overflow-activator="true"]) {
            background: rgba(255, 255, 255, 0.5) !important;
            backdrop-filter: blur(10px) saturate(118%) !important;
            -webkit-backdrop-filter: blur(10px) saturate(118%) !important;
            border: 1px solid rgba(255, 255, 255, 0.34) !important;
            box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.36) !important;
        }
        /* 节点标识样式优化 */
        .ai-nav-dot {
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            opacity: 0.6;
            filter: grayscale(0.2);
            transition: all 0.24s cubic-bezier(0.22, 0.61, 0.36, 1);
        }
        @keyframes ai-dot-active-ripple {
            0% {
                box-shadow: 0 0 0 2px #fff, 0 6px 16px rgba(0,0,0,0.2), 0 0 0 0 rgba(70, 167, 88, 0.38);
            }
            70% {
                box-shadow: 0 0 0 2px #fff, 0 6px 16px rgba(0,0,0,0.2), 0 0 0 10px rgba(70, 167, 88, 0);
            }
            100% {
                box-shadow: 0 0 0 2px #fff, 0 6px 16px rgba(0,0,0,0.2), 0 0 0 0 rgba(70, 167, 88, 0);
            }
        }
        .ai-dot-active-ripple {
            animation: ai-dot-active-ripple 1.8s ease-out infinite;
        }
    `;
    if (document.head) document.head.appendChild(styleTag);

    if (removeAds && document.body) document.body.classList.add('ai-nodes-hide-ads');
    if (isQwen && qwenGlassPopups && document.body) document.body.classList.add('ai-nodes-qwen-glass-popups');
    if (hideDeepSeekNativeNav && document.body) document.body.classList.add('ai-nodes-hide-deepseek-native-nav');
    if (isDoubao && doubaoGlassPopups && document.body) document.body.classList.add('ai-nodes-doubao-glass-popups');

    // ===== 拖拽手柄 =====
    const dragHandle = document.createElement('div');
    dragHandle.style.width = '32px';
    dragHandle.style.height = '4px';
    dragHandle.style.background = 'rgba(160, 160, 160, 0.3)';
    dragHandle.style.borderRadius = '10px';
    dragHandle.style.margin = '0 auto 6px';
    dragHandle.style.cursor = 'grab';
    dragHandle.style.flexShrink = '0';
    dragHandle.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
    dragHandle.title = '拖动调整位置';
    container.prepend(dragHandle);
    dragHandle.onmouseleave = () => dragHandle.style.background = 'rgba(150, 150, 150, 0.4)';

    let isDragging = false;
    let startX, startY, startRight, startTop;
    const SETTINGS_BUTTON_SAFE_HEIGHT = 42;
    const SETTINGS_BUTTON_GAP = 10;
    const SETTINGS_VIEWPORT_PADDING = 8;

    function getMaxRailTopWithSettingsSpace() {
        const railRect = container.getBoundingClientRect();
        const reserveBottom = SETTINGS_BUTTON_SAFE_HEIGHT + SETTINGS_BUTTON_GAP + SETTINGS_VIEWPORT_PADDING;
        return Math.max(0, Math.floor(window.innerHeight - reserveBottom - railRect.height));
    }

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
        const maxTop = Math.max(0, Math.min(window.innerHeight - 30, getMaxRailTopWithSettingsSpace()));
        
        const newRight = Math.max(0, Math.min(maxRight, startRight + deltaX));
        const newTop = Math.max(0, Math.min(maxTop, startTop + deltaY));
        
        container.style.right = newRight + 'px';
        container.style.top = newTop + 'px';
        container.style.maxHeight = `calc(100vh - ${newTop + CONFIG.bottomGap}px)`;
        
        localStorage.setItem('AI-Chat-Helper-pos', JSON.stringify({ right: newRight, top: newTop }));
        render(); // 实时刷新高度计算
    });

    document.addEventListener('mouseup', () => {
        if (isDragging) {
            isDragging = false;
            dragHandle.style.cursor = 'grab';
            document.body.style.userSelect = '';
        }
    });

    // 读取保存的位置
    const savedPos = JSON.parse(localStorage.getItem('AI-Chat-Helper-pos'));
    if (savedPos) {
        const maxRight = window.innerWidth - CONFIG.panelWidth;
        const maxTop = Math.max(0, Math.min(window.innerHeight - 30, getMaxRailTopWithSettingsSpace()));
        const clampedRight = Math.max(0, Math.min(maxRight, Number(savedPos.right) || 0));
        const clampedTop = Math.max(0, Math.min(maxTop, Number(savedPos.top) || 0));
        container.style.right = clampedRight + 'px';
        container.style.top = clampedTop + 'px';
        container.style.maxHeight = `calc(100vh - ${clampedTop + CONFIG.bottomGap}px)`;
    }

    function getOrbitalScrollBounds(totalCount) {
        if (!scrollArea || !scrollArea.clientHeight) return { min: 0, max: 0 };
        const h = scrollArea.clientHeight;
        const pad = 24 * 2 + CONFIG.dotSize;
        const dotGap = CONFIG.dotGap;
        const actualLimit = Math.max(1, (h - pad) / dotGap + 1);
        
        return {
            min: 0,
            max: Math.max(0, totalCount - actualLimit)
        };
    }

    function stopOrbitalAnimation() {
        if (orbitalAnimationFrame) {
            cancelAnimationFrame(orbitalAnimationFrame);
            orbitalAnimationFrame = 0;
        }
        orbitalAnimFrom = orbitalScrollOffset;
        orbitalAnimTo = orbitalScrollOffset;
        orbitalAnimStartAt = 0;
    }

    function runOrbitalAnimation() {
        const now = (window.performance && typeof window.performance.now === 'function')
            ? window.performance.now()
            : Date.now();
        const dist = Math.abs(orbitalTargetScrollOffset - orbitalScrollOffset);
        if (dist < 0.0008) {
            orbitalScrollOffset = orbitalTargetScrollOffset;
            orbitalLastRenderedOffset = NaN;
            render();
            return;
        }

        orbitalAnimFrom = orbitalScrollOffset;
        orbitalAnimTo = orbitalTargetScrollOffset;
        orbitalAnimStartAt = now;
        orbitalAnimDuration = Math.max(120, Math.min(320, 140 + dist * 18));

        if (orbitalAnimationFrame) return;

        const tick = (ts) => {
            const elapsed = Math.max(0, (ts || now) - orbitalAnimStartAt);
            const t = Math.min(1, elapsed / Math.max(1, orbitalAnimDuration));
            const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
            orbitalScrollOffset = orbitalAnimFrom + (orbitalAnimTo - orbitalAnimFrom) * eased;

            if (!Number.isFinite(orbitalLastRenderedOffset) || Math.abs(orbitalScrollOffset - orbitalLastRenderedOffset) > 0.001 || t >= 1) {
                orbitalLastRenderedOffset = orbitalScrollOffset;
                render();
            }

            if (t >= 1) {
                orbitalAnimationFrame = 0;
                if (Math.abs(orbitalTargetScrollOffset - orbitalScrollOffset) > 0.001) {
                    runOrbitalAnimation();
                } else {
                    orbitalScrollOffset = orbitalTargetScrollOffset;
                    orbitalLastRenderedOffset = NaN;
                    render();
                }
                return;
            }
            orbitalAnimationFrame = requestAnimationFrame(tick);
        };
        orbitalAnimationFrame = requestAnimationFrame(tick);
    }

    function handleOrbitalScroll(e) {
        if (nodes.length <= 1) return;
        e.preventDefault();
        e.stopPropagation();
        orbitalLastInteractionAt = Date.now();
        const bounds = getOrbitalScrollBounds(nodes.length);
        orbitalTargetScrollOffset += e.deltaY * 0.04;
        orbitalTargetScrollOffset = Math.max(bounds.min, Math.min(bounds.max, orbitalTargetScrollOffset));
        runOrbitalAnimation();
    }

    function centerNodeInOrbital(index, immediate = false) {
        if (index < 0 || index >= nodes.length || !scrollArea) return;
        const h = scrollArea.clientHeight || 100;
        const pad = 24 * 2 + CONFIG.dotSize;
        const dotGap = CONFIG.dotGap;
        const actualLimit = Math.max(1, (h - pad) / dotGap + 1);
        
        const target = Math.max(0, index - (actualLimit - 1) / 2);
        const bounds = getOrbitalScrollBounds(nodes.length);
        const clamped = Math.max(bounds.min, Math.min(bounds.max, target));
        
        orbitalTargetScrollOffset = clamped;
        if (immediate) {
            stopOrbitalAnimation();
            orbitalScrollOffset = clamped;
            orbitalLastRenderedOffset = NaN;
            render();
        } else {
            runOrbitalAnimation();
        }
    }


    // ===== 滚动层：只负责垂直滚动，不裁切圆点横向空间 =====
    const scrollArea = document.createElement('div');
    scrollArea.className = 'ai-navigator-scroll';
    scrollArea.style.position = 'relative';
    scrollArea.style.width = '100%';
    scrollArea.style.height = '0';
    scrollArea.style.overflow = 'hidden';
    scrollArea.style.pointerEvents = 'auto';
    scrollArea.style.boxSizing = 'border-box';
    scrollArea.style.padding = '0';
    container.addEventListener('wheel', handleOrbitalScroll, { passive: false });
    scrollArea.addEventListener('wheel', handleOrbitalScroll, { passive: false });
    container.appendChild(scrollArea);

    // ===== 内容层：给轨道和圆点留完整空间 =====
    const content = document.createElement('div');
    content.style.position = 'relative';
    content.style.width = '100%';
    content.style.minHeight = '100%';
    content.style.overflow = 'visible';
    content.addEventListener('wheel', handleOrbitalScroll, { passive: false });
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
    track.style.zIndex = '1';
    container.appendChild(track); // 移动到容器中，固定不滚动

    // ===== 节点层：宽于轨道，避免圆点被裁切 =====
    const dotsLayer = document.createElement('div');
    dotsLayer.style.position = 'absolute';
    dotsLayer.style.left = '0';
    dotsLayer.style.top = '0';
    dotsLayer.style.width = '100%';
    dotsLayer.style.height = '100%';
    dotsLayer.style.overflow = 'visible';
    content.appendChild(dotsLayer);
    let hoveredDot = null;
    let jumpToastEl = null;
    let jumpToastStateEl = null;
    let jumpToastNodeEl = null;
    let jumpToastSecondaryEl = null;
    let jumpToastSecondaryStateEl = null;
    let jumpToastSecondaryNodeEl = null;
    let jumpToastSecondaryHideTimer = 0;
    let jumpToastPendingNodeId = '';
    let jumpToastWatchRaf = 0;
    let jumpToastArrivedTimer = 0;
    let jumpToastArrivedShownId = '';

    let fixedScrollDragging = false; // 虽然移除了 UI，但保留部分内部状态标记以防代码依赖


    function ensureNavigatorMounted() {
        if (!document.body || !document.head) return false;
        if (!globalTooltip.isConnected) document.body.appendChild(globalTooltip);
        if (!styleTag.isConnected) document.head.appendChild(styleTag);
        document.body.classList.toggle('ai-nodes-hide-ads', Boolean(removeAds));
        document.body.classList.toggle('ai-nodes-qwen-glass-popups', Boolean(isQwen && qwenGlassPopups));
        document.body.classList.toggle('ai-nodes-hide-deepseek-native-nav', Boolean(isDeepSeek && hideDeepSeekNativeNav));
        document.body.classList.toggle('ai-nodes-doubao-glass-popups', Boolean(isDoubao && doubaoGlassPopups));
        if (!container.isConnected) {
            document.body.appendChild(container);
            qwenNodeLog('nav:reattach-container', { isConnected: container.isConnected });
        }
        if (!dragHandle.isConnected) container.prepend(dragHandle);
        if (!scrollArea.isConnected) container.appendChild(scrollArea);
        if (!content.isConnected) scrollArea.appendChild(content);
        if (track.parentElement !== content) content.appendChild(track); // 强制移动到内容层，与圆点共享坐标系
        if (!dotsLayer.isConnected) content.appendChild(dotsLayer);
        return true;
    }

    function updateFixedScrollIndicator() {}

    function getNodeFromDotElement(dotEl) {
        const id = String(dotEl?.dataset?.nodeId || '').trim();
        if (!id) return null;
        return nodesMap.get(id) || nodes.find((n) => String(n?.id || '') === id) || null;
    }

    function showTooltipForDot(dotEl, node) {
        if (!dotEl || !node) return;
        if (node.id !== activeNodeId) {
            dotEl.style.transform = 'translate(-50%, -50%) scale(1.45)';
        }

        globalTooltip.innerText = String(node.text || '').slice(0, 150) + (String(node.text || '').length > 150 ? '...' : '');
        const dotRect = dotEl.getBoundingClientRect();
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
    }

    function hideTooltipForDot(dotEl, node) {
        if (dotEl && node && node.id !== activeNodeId) {
            dotEl.style.transform = 'translate(-50%, -50%) scale(1)';
        }
        globalTooltip.style.opacity = '0';
        const side = globalTooltip.dataset.side || 'left';
        if (side === 'right') {
            globalTooltip.style.transform = 'translate(calc(-100% + 10px), -50%) scale(0.95)';
        } else {
            globalTooltip.style.transform = 'translate(-10px, -50%) scale(0.95)';
        }
    }

    function clearJumpToastWatch() {
        if (jumpToastWatchRaf) {
            cancelAnimationFrame(jumpToastWatchRaf);
            jumpToastWatchRaf = 0;
        }
    }

    function clearJumpToastArrivedTimer() {
        if (jumpToastArrivedTimer) {
            clearTimeout(jumpToastArrivedTimer);
            jumpToastArrivedTimer = 0;
        }
    }

    function clearJumpToastSecondaryTimer() {
        if (jumpToastSecondaryHideTimer) {
            clearTimeout(jumpToastSecondaryHideTimer);
            jumpToastSecondaryHideTimer = 0;
        }
    }

    function getJumpToastNodeLabel(nodeId) {
        const id = String(nodeId || '').trim();
        if (!id) return '';
        const node = nodesMap.get(id) || nodes.find((n) => String(n?.id || '') === id) || null;
        return String(node?.text || '').trim().slice(0, 36) || String(id).slice(0, 16);
    }

    function parseCssColorToRgb(rawColor) {
        const color = String(rawColor || '').trim();
        if (!color) return null;
        const hexMatch = color.match(/^#([0-9a-f]{3,8})$/i);
        if (hexMatch) {
            const hex = hexMatch[1];
            if (hex.length === 3 || hex.length === 4) {
                const r = parseInt(hex[0] + hex[0], 16);
                const g = parseInt(hex[1] + hex[1], 16);
                const b = parseInt(hex[2] + hex[2], 16);
                return { r, g, b };
            }
            if (hex.length === 6 || hex.length === 8) {
                const r = parseInt(hex.slice(0, 2), 16);
                const g = parseInt(hex.slice(2, 4), 16);
                const b = parseInt(hex.slice(4, 6), 16);
                return { r, g, b };
            }
        }
        const rgbMatch = color.match(/rgba?\(\s*([0-9.]+)\s*[, ]\s*([0-9.]+)\s*[, ]\s*([0-9.]+)/i);
        if (!rgbMatch) return null;
        return {
            r: Math.max(0, Math.min(255, Math.round(Number(rgbMatch[1]) || 0))),
            g: Math.max(0, Math.min(255, Math.round(Number(rgbMatch[2]) || 0))),
            b: Math.max(0, Math.min(255, Math.round(Number(rgbMatch[3]) || 0)))
        };
    }

    function rgbToRgbaText(rgb, alpha) {
        if (!rgb) return `rgba(59,130,246,${alpha})`;
        return `rgba(${rgb.r},${rgb.g},${rgb.b},${alpha})`;
    }

    function mixRgb(rgbA, rgbB, ratio) {
        const safeRatio = Math.max(0, Math.min(1, Number(ratio) || 0));
        const inv = 1 - safeRatio;
        return {
            r: Math.round((rgbA.r * inv) + (rgbB.r * safeRatio)),
            g: Math.round((rgbA.g * inv) + (rgbB.g * safeRatio)),
            b: Math.round((rgbA.b * inv) + (rgbB.b * safeRatio))
        };
    }

    function resolveThemeAccentRgb() {
        const fallback = isChatGPT
            ? { r: 16, g: 163, b: 127 }
            : (isDeepSeek ? { r: 59, g: 130, b: 246 } : { r: 37, g: 99, b: 235 });
        try {
            const roots = [document.documentElement, document.body].filter(Boolean);
            const varNames = [
                '--primary-color',
                '--theme-primary',
                '--theme-color',
                '--color-primary',
                '--brand-color',
                '--accent-color',
                '--link-color',
                '--ds-color-brand',
                '--semi-color-primary'
            ];
            for (const root of roots) {
                const style = window.getComputedStyle(root);
                for (const varName of varNames) {
                    const rgb = parseCssColorToRgb(style.getPropertyValue(varName));
                    if (rgb) return rgb;
                }
            }
            const probeSelectors = [
                'button[class*="primary"]',
                '[class*="primary"] button',
                '[role="button"][class*="primary"]',
                'a[href]'
            ];
            for (const selector of probeSelectors) {
                const el = document.querySelector(selector);
                if (!el) continue;
                const style = window.getComputedStyle(el);
                const rgb = parseCssColorToRgb(style.color) || parseCssColorToRgb(style.backgroundColor);
                if (rgb) return rgb;
            }
        } catch (e) {
            // ignore theme sampling errors
        }
        return fallback;
    }

    function ensureJumpToastLayout() {
        if (jumpToastEl && jumpToastEl.isConnected && jumpToastStateEl && jumpToastNodeEl) return;
        if (!jumpToastEl || !jumpToastEl.isConnected) {
            jumpToastEl = document.createElement('div');
            jumpToastEl.id = 'ai-nodes-jump-toast';
            jumpToastEl.style.cssText = [
                'position:fixed',
                'left:50%',
                'top:24px',
                'transform:translateX(-50%) translateY(-8px)',
                'z-index:1000005',
                'background:rgba(255,255,255,0.5)',
                'color:rgba(0,0,0,0.92)',
                'border-radius:14px',
                'border:none',
                'padding:8px 12px',
                'line-height:1.3',
                'backdrop-filter:blur(14px) saturate(1.12)',
                '-webkit-backdrop-filter:blur(14px) saturate(1.12)',
                'box-shadow:0 12px 30px rgba(15,23,42,0.12)',
                'opacity:0',
                'transition:opacity .2s ease, transform .2s ease',
                'display:flex',
                'align-items:center',
                'gap:8px',
                'max-width:min(70vw, 560px)'
            ].join(';');
            document.body.appendChild(jumpToastEl);
        }
        jumpToastEl.innerHTML = '';
        jumpToastStateEl = document.createElement('span');
        jumpToastStateEl.style.cssText = [
            'flex:none',
            'padding:2px 8px',
            'border-radius:999px',
            'font-size:11px',
            'font-weight:700',
            'letter-spacing:.2px',
            'background:transparent',
            'color:rgba(37,99,235,0.96)'
        ].join(';');
        jumpToastNodeEl = document.createElement('span');
        jumpToastNodeEl.style.cssText = [
            'min-width:0',
            'font-size:12px',
            'font-weight:500',
            'color:rgba(0,0,0,0.88)',
            'white-space:nowrap',
            'overflow:hidden',
            'text-overflow:ellipsis'
        ].join(';');
        jumpToastEl.appendChild(jumpToastStateEl);
        jumpToastEl.appendChild(jumpToastNodeEl);
    }

    function ensureJumpToastSecondaryLayout() {
        if (jumpToastSecondaryEl && jumpToastSecondaryEl.isConnected && jumpToastSecondaryStateEl && jumpToastSecondaryNodeEl) return;
        if (!jumpToastSecondaryEl || !jumpToastSecondaryEl.isConnected) {
            jumpToastSecondaryEl = document.createElement('div');
            jumpToastSecondaryEl.id = 'ai-nodes-jump-toast-secondary';
            jumpToastSecondaryEl.style.cssText = [
                'position:fixed',
                'left:50%',
                'top:64px',
                'transform:translateX(-50%) translateY(-8px)',
                'z-index:1000004',
                'background:rgba(255,255,255,0.5)',
                'color:rgba(0,0,0,0.92)',
                'border-radius:14px',
                'border:none',
                'padding:8px 12px',
                'line-height:1.3',
                'backdrop-filter:blur(14px) saturate(1.12)',
                '-webkit-backdrop-filter:blur(14px) saturate(1.12)',
                'box-shadow:0 10px 22px rgba(15,23,42,0.1)',
                'opacity:0',
                'transition:opacity .2s ease, transform .2s ease',
                'display:flex',
                'align-items:center',
                'gap:8px',
                'max-width:min(70vw, 560px)',
                'pointer-events:none'
            ].join(';');
            document.body.appendChild(jumpToastSecondaryEl);
        }
        jumpToastSecondaryEl.innerHTML = '';
        jumpToastSecondaryStateEl = document.createElement('span');
        jumpToastSecondaryStateEl.style.cssText = [
            'flex:none',
            'padding:2px 8px',
            'border-radius:999px',
            'font-size:11px',
            'font-weight:700',
            'letter-spacing:.2px',
            'background:transparent',
            'color:rgba(37,99,235,0.96)'
        ].join(';');
        jumpToastSecondaryNodeEl = document.createElement('span');
        jumpToastSecondaryNodeEl.style.cssText = [
            'min-width:0',
            'font-size:12px',
            'font-weight:500',
            'color:rgba(0,0,0,0.88)',
            'white-space:nowrap',
            'overflow:hidden',
            'text-overflow:ellipsis'
        ].join(';');
        jumpToastSecondaryEl.appendChild(jumpToastSecondaryStateEl);
        jumpToastSecondaryEl.appendChild(jumpToastSecondaryNodeEl);
    }

    function renderJumpToastSecondary(stateText, nodeText, arrived = false) {
        ensureJumpToastSecondaryLayout();
        if (!jumpToastSecondaryStateEl || !jumpToastSecondaryNodeEl || !jumpToastSecondaryEl) return;
        const themeBlueRgb = { r: 37, g: 99, b: 235 };
        jumpToastSecondaryEl.style.background = 'rgba(255,255,255,0.5)';
        jumpToastSecondaryStateEl.textContent = String(stateText || '').trim();
        jumpToastSecondaryNodeEl.textContent = String(nodeText || '').trim();
        if (arrived) {
            jumpToastSecondaryStateEl.style.background = 'transparent';
            jumpToastSecondaryStateEl.style.color = rgbToRgbaText(themeBlueRgb, 0.98);
            jumpToastSecondaryNodeEl.style.color = 'rgba(0,0,0,0.88)';
        } else {
            jumpToastSecondaryStateEl.style.background = 'transparent';
            jumpToastSecondaryStateEl.style.color = rgbToRgbaText(themeBlueRgb, 0.96);
            jumpToastSecondaryNodeEl.style.color = 'rgba(0,0,0,0.88)';
        }
        jumpToastSecondaryEl.style.opacity = '1';
        jumpToastSecondaryEl.style.transform = 'translateX(-50%) translateY(0)';
        clearJumpToastSecondaryTimer();
        jumpToastSecondaryHideTimer = setTimeout(() => {
            jumpToastSecondaryHideTimer = 0;
            if (!jumpToastSecondaryEl) return;
            jumpToastSecondaryEl.style.opacity = '0';
            jumpToastSecondaryEl.style.transform = 'translateX(-50%) translateY(-8px)';
        }, 1200);
    }

    function renderJumpToast(stateText, nodeText, arrived = false) {
        ensureJumpToastLayout();
        if (!jumpToastStateEl || !jumpToastNodeEl || !jumpToastEl) return;
        const themeBlueRgb = { r: 37, g: 99, b: 235 };
        jumpToastEl.style.background = 'rgba(255,255,255,0.5)';
        jumpToastStateEl.textContent = String(stateText || '').trim();
        jumpToastNodeEl.textContent = String(nodeText || '').trim();
        if (arrived) {
            jumpToastStateEl.style.background = 'transparent';
            jumpToastStateEl.style.color = rgbToRgbaText(themeBlueRgb, 0.98);
            jumpToastNodeEl.style.color = 'rgba(0,0,0,0.88)';
        } else {
            jumpToastStateEl.style.background = 'transparent';
            jumpToastStateEl.style.color = rgbToRgbaText(themeBlueRgb, 0.96);
            jumpToastNodeEl.style.color = 'rgba(0,0,0,0.88)';
        }
    }

    function scheduleJumpToastHideAfterArrived(nodeId) {
        const id = String(nodeId || '').trim();
        if (!id || jumpToastArrivedTimer) return;
        if (jumpToastEl && jumpToastArrivedShownId !== id) {
            renderJumpToast('已达到', getJumpToastNodeLabel(id), true);
            jumpToastArrivedShownId = id;
        }
        jumpToastArrivedTimer = setTimeout(() => {
            jumpToastArrivedTimer = 0;
            if (!jumpToastPendingNodeId || String(jumpToastPendingNodeId) !== id) return;
            if (!isJumpTargetArrived(id)) return;
            hideJumpToast();
        }, 1000);
    }

    function hideJumpToast() {
        clearJumpToastWatch();
        clearJumpToastArrivedTimer();
        clearJumpToastSecondaryTimer();
        jumpToastPendingNodeId = '';
        jumpToastArrivedShownId = '';
        if (!jumpToastEl) return;
        jumpToastEl.style.opacity = '0';
        jumpToastEl.style.transform = 'translateX(-50%) translateY(-8px)';
        if (jumpToastSecondaryEl) {
            jumpToastSecondaryEl.style.opacity = '0';
            jumpToastSecondaryEl.style.transform = 'translateX(-50%) translateY(-8px)';
        }
    }

    function isJumpTargetArrived(nodeId) {
        const id = String(nodeId || '').trim();
        if (!id) return false;

        if ((isQwen || isDoubao || isDeepSeek) && String(activeNodeId || '') === id) {
            return true;
        }

        const node = nodesMap.get(id) || nodes.find((n) => String(n?.id || '') === id) || null;
        let targetEl = node?.element || null;
        if ((!targetEl || !targetEl.isConnected) && node) {
            if (isQwen) targetEl = findQwenDomElementByNode(node);
            else if (isDeepSeek) targetEl = findDeepSeekDomElementByNode(node);
            else if (isDoubao) targetEl = findDoubaoDomElementByNode(node);
            if (targetEl) node.element = targetEl;
        }
        if (!targetEl || !targetEl.isConnected) return String(activeNodeId || '') === id;

        const scrollEl = getScrollContainer();
        if (!scrollEl) return false;
        const containerTop = (scrollEl === window || scrollEl === document.documentElement || scrollEl === document.scrollingElement)
            ? 0
            : scrollEl.getBoundingClientRect().top;
        const readingLineOffset = Math.max(10, Math.min(500, CONFIG.readingLineOffset || 150));
        const targetTop = containerTop + readingLineOffset;
        if (isDeepSeek && node) {
            const alignY = getDeepSeekNodeAlignY(node, scrollEl);
            const readingY = getDeepSeekReadingY(scrollEl);
            const delta = alignY - readingY;
            if (Math.abs(delta) <= 28) return true;
            const metrics = getDeepSeekScrollMetrics(scrollEl);
            const atTop = metrics.top <= 1;
            const atBottom = metrics.top >= metrics.maxTop - 1;
            if ((delta < 0 && atTop) || (delta > 0 && atBottom)) return true;
            return false;
        }
        const rect = targetEl.getBoundingClientRect();
        return Math.abs(rect.top - targetTop) <= 28;
    }

    function startJumpToastWatch(nodeId) {
        const id = String(nodeId || '').trim();
        clearJumpToastWatch();
        jumpToastPendingNodeId = id;
        if (!id) return;
        const tick = () => {
            if (!jumpToastPendingNodeId) return;
            if (isJumpTargetArrived(jumpToastPendingNodeId)) {
                scheduleJumpToastHideAfterArrived(jumpToastPendingNodeId);
            } else {
                clearJumpToastArrivedTimer();
            }
            jumpToastWatchRaf = requestAnimationFrame(tick);
        };
        jumpToastWatchRaf = requestAnimationFrame(tick);
    }

    function showJumpToast(node) {
        const label = String(node?.text || '').trim().slice(0, 36) || String(node?.id || '').slice(0, 16);
        const nodeIndex = Math.max(0, nodes.findIndex((n) => String(n?.id || '') === String(node?.id || ''))) + 1;
        const total = nodes.length || 0;
        const state = total > 0 ? `正在跳转 ${nodeIndex}/${total}` : '正在跳转';
        ensureJumpToastLayout();
        if (
            jumpToastEl &&
            jumpToastEl.style.opacity === '1' &&
            (String(jumpToastStateEl?.textContent || '').trim() || String(jumpToastNodeEl?.textContent || '').trim())
        ) {
            const prevStateText = String(jumpToastStateEl?.textContent || '').trim();
            const prevNodeText = String(jumpToastNodeEl?.textContent || '').trim();
            if (prevStateText || prevNodeText) {
                renderJumpToastSecondary(prevStateText, prevNodeText, /^已达到/.test(prevStateText));
            }
        }
        renderJumpToast(state, label, false);
        jumpToastArrivedShownId = '';
        jumpToastEl.style.opacity = '1';
        jumpToastEl.style.transform = 'translateX(-50%) translateY(0)';
        startJumpToastWatch(node?.id);
    }

    dotsLayer.addEventListener('mouseover', (e) => {
        const dot = e.target && e.target.closest ? e.target.closest('.ai-nav-dot') : null;
        if (!dot || !dotsLayer.contains(dot) || hoveredDot === dot) return;
        if (hoveredDot) {
            const prevNode = getNodeFromDotElement(hoveredDot);
            hideTooltipForDot(hoveredDot, prevNode);
        }
        hoveredDot = dot;
        const node = getNodeFromDotElement(dot);
        if (node) showTooltipForDot(dot, node);
    });

    dotsLayer.addEventListener('mouseout', (e) => {
        if (!hoveredDot) return;
        const related = e.relatedTarget;
        if (related && hoveredDot.contains(related)) return;
        const node = getNodeFromDotElement(hoveredDot);
        hideTooltipForDot(hoveredDot, node);
        hoveredDot = null;
    });

    dotsLayer.addEventListener('click', (e) => {
        const dot = e.target && e.target.closest ? e.target.closest('.ai-nav-dot') : null;
        if (!dot || !dotsLayer.contains(dot)) return;
        e.stopPropagation();
        const node = getNodeFromDotElement(dot);
        if (!node) return;
        showJumpToast(node);
        const jumpedNow = jumpToMessage(node.element, node.id);
        if (jumpedNow) {
            if (isQwen || isDeepSeek) {
                setTimeout(() => {
                    scheduleActiveNodeUpdate();
                }, 420);
            } else {
                setActiveDot(dot, node.id);
                scrollDotIntoView(dot);
                scheduleActiveNodeUpdate();
            }
        } else {
            scheduleActiveNodeUpdate();
        }
    });

    function getMessages() {
        const list = [];
        // 使用全局变量 host
        if (isChatGPT) {
            const msgs = document.querySelectorAll('[data-message-author-role], article[data-testid^="conversation-turn-"] [data-message-author-role="user"], [data-testid="conversation-turn-user"]');
            const seen = new Set();
            msgs.forEach((el, index) => {
                const textEl = el.querySelector('.whitespace-pre-wrap, [data-message-content], .markdown, .prose, [dir="auto"]') || el;
                if (!textEl) return;
                const text = (textEl.innerText || '').trim();
                if (!text) return;
                const role = String(el.getAttribute('data-message-author-role') || '').toLowerCase();
                const isUser = role === 'user' || el.getAttribute('data-testid') === 'conversation-turn-user';
                if (isUser) {
                    const id = el.getAttribute('data-message-id') || el.getAttribute('data-testid') || `chatgpt-user-${index}`;
                    const dedupeKey = `${id}::${text.slice(0, 60)}`;
                    if (seen.has(dedupeKey)) return;
                    seen.add(dedupeKey);
                    list.push({
                        id: id,
                        element: textEl, // 修改：高亮文字容器
                        role: 'user',
                        text: text
                    });
                }
            });
        } else if (isQwen) {
            flushQwenPendingApiPayloads();
            const currentSessionId = getQwenSessionIdFromUrl();
            if (!qwenVirtualNodesLoaded || qwenVirtualNodesDirty || !qwenVirtualNodesSessionId || (currentSessionId && qwenVirtualNodesSessionId !== currentSessionId)) {
                scheduleQwenVirtualNodesRefresh();
            }
            reconcileQwenPendingDomNodesWithApi();
            // 千问节点主链路：仅使用 API 结果构建轨道顺序，避免 DOM 分页窗口导致顺序抖动。
            // DOM 仅用于“点击后定位/激活判定”，不再参与节点集合生成。
            if (!qwenVirtualNodesSessionId || !currentSessionId || qwenVirtualNodesSessionId === currentSessionId) {
                const cached = Array.isArray(qwenVirtualNodesCache) ? qwenVirtualNodesCache : [];
                const merged = cached.slice();
                qwenPendingDomNodes.forEach((p) => {
                    if (!p || !p.text) return;
                    if (hasQwenApiNodeForDom(p.sourceMessageId || '', p.text || '')) return;
                    merged.push(p);
                });
                merged.sort((a, b) => getQwenSessionIndexValue(a?.sessionIndex) - getQwenSessionIndexValue(b?.sessionIndex));
                merged.forEach((item, idx) => {
                    if (!item || !item.text) return;
                    list.push({
                        ...item,
                        sessionIndex: getQwenSessionIndexValue(item.sessionIndex) !== -1
                            ? getQwenSessionIndexValue(item.sessionIndex)
                            : idx,
                        element: null
                    });
                });
            }
        } else if (host.includes('doubao.com')) {
            const domUserCount = document.querySelectorAll('[data-testid="send_message"]').length;
            const domSig = getDoubaoDomUserSignature();
            if (domSig && domSig !== doubaoLastDomUserSignature) {
                doubaoLastDomUserSignature = domSig;
                doubaoVirtualNodesDirty = true;
            } else if (domUserCount && domUserCount !== doubaoVirtualNodesCache.length) {
                doubaoVirtualNodesDirty = true;
            }
            if (!doubaoVirtualNodesLoaded || doubaoVirtualNodesDirty) {
                scheduleDoubaoVirtualNodesRefresh();
            }
            reconcileDoubaoPendingDomNodesWithApi();
            const cached = Array.isArray(doubaoVirtualNodesCache) ? doubaoVirtualNodesCache : [];
            // 豆包节点主链路：仅使用 API 结果构建轨道顺序。
            // DOM 仅用于定位与激活判断，不参与节点集合生成。
            const merged = cached.slice();
            doubaoPendingDomNodes.forEach((p) => {
                if (!p || !p.text) return;
                if (hasDoubaoApiNodeForDom(p.sourceMessageId || '', p.text || '')) return;
                merged.push(p);
            });
            merged.sort((a, b) => {
                const ia = Number(a?.sessionIndex);
                const ib = Number(b?.sessionIndex);
                const va = Number.isFinite(ia) ? ia : Number.MAX_SAFE_INTEGER;
                const vb = Number.isFinite(ib) ? ib : Number.MAX_SAFE_INTEGER;
                return va - vb;
            });
            merged.forEach((item, idx) => {
                if (!item || !item.text) return;
                list.push({
                    ...item,
                    sessionIndex: Number.isInteger(Number(item.sessionIndex)) ? Number(item.sessionIndex) : idx,
                    element: null
                });
            });
        } else if (host.includes('deepseek.com')) {
            scheduleDeepSeekVirtualNodesRefresh();
            const cached = Array.isArray(deepseekVirtualNodesCache) ? deepseekVirtualNodesCache : [];
            const fromApi = cached.map((item, idx) => ({
                ...item,
                role: 'user',
                sessionIndex: Number.isInteger(Number(item?.sessionIndex)) ? Number(item.sessionIndex) : idx,
                element: null
            }));
            rebindDeepSeekNodesToDom(fromApi, true);
            fromApi.forEach((item) => list.push(item));
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

    function primeOrbitalToLatest() {
        // 交给 render 内的 bounds clamp 收敛到最大可滚偏移。
        orbitalTargetScrollOffset = Number.MAX_SAFE_INTEGER;
        orbitalScrollOffset = Number.MAX_SAFE_INTEGER;
    }

    function getDoubaoDomUserSignature() {
        const rows = Array.from(document.querySelectorAll('[data-testid="send_message"]'));
        if (!rows.length) return '';

        const pick = [];
        const step = Math.max(1, Math.floor(rows.length / 6));
        for (let i = 0; i < rows.length; i += step) {
            const row = rows[i];
            const msgId = String(
                row?.querySelector('[data-testid="message_content"]')?.getAttribute('data-message-id')
                || row?.getAttribute('data-id')
                || ''
            ).trim();
            const txt = String(
                row?.querySelector('[data-testid="ref-content"]')?.innerText
                || row?.querySelector('[data-testid="message_text_content"]')?.innerText
                || row?.querySelector('[data-testid="message_content"]')?.innerText
                || ''
            ).replace(/\s+/g, ' ').trim().slice(0, 32);
            pick.push(`${msgId}|${txt}`);
            if (pick.length >= 8) break;
        }

        const first = rows[0];
        const last = rows[rows.length - 1];
        const firstId = String(first?.querySelector('[data-testid="message_content"]')?.getAttribute('data-message-id') || first?.getAttribute('data-id') || '').trim();
        const lastId = String(last?.querySelector('[data-testid="message_content"]')?.getAttribute('data-message-id') || last?.getAttribute('data-id') || '').trim();
        return `${rows.length}::${firstId}::${lastId}::${pick.join('||')}`;
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

    function isDeepSeekPageListUrl(rawUrl) {
        try {
            const u = new URL(rawUrl, window.location.origin);
            return u.pathname.includes(DEEPSEEK_PAGE_LIST_PATH);
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
        const linkCandidates = Array.from(document.querySelectorAll('a[href*="/a/chat/s/"], a[href*="/chat/"], a[href*="chat_session_id="], a[href*="session_id="]'));
        for (const a of linkCandidates) {
            const href = String(a.getAttribute('href') || '');
            const m = href.match(/\/a\/chat\/s\/([0-9a-f-]{36})/i)
                || href.match(/\/chat\/([0-9a-f-]{36})/i)
                || href.match(/[?&#](?:chat_session_id|session_id|id)=([0-9a-f-]{36})/i);
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
                if (url && (isDeepSeekHistoryUrl(url) || isDeepSeekPageListUrl(url))) {
                    const mergedHeaders = sanitizeDeepSeekHeaders({
                        ...parseDeepSeekHeaders(input?.headers),
                        ...parseDeepSeekHeaders(init?.headers)
                    });
                    deepseekCapturedHeaders = mergedHeaders;
                    if (isDeepSeekPageListUrl(url)) {
                        deepseekPageListTemplate = {
                            url,
                            headers: mergedHeaders
                        };
                    }
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
                if (this.__aiNodesDeepSeekUrl && (isDeepSeekHistoryUrl(this.__aiNodesDeepSeekUrl) || isDeepSeekPageListUrl(this.__aiNodesDeepSeekUrl))) {
                    const mergedHeaders = sanitizeDeepSeekHeaders(this.__aiNodesDeepSeekHeaders || {});
                    deepseekCapturedHeaders = mergedHeaders;
                    if (isDeepSeekPageListUrl(this.__aiNodesDeepSeekUrl)) {
                        deepseekPageListTemplate = {
                            url: String(this.__aiNodesDeepSeekUrl || ''),
                            headers: mergedHeaders
                        };
                    }
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
                    sourceMessageId: msgId,
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

                    if (
                        fragmentType === 'TIP'
                        || fragmentType.startsWith('TOOL_')
                        || fragmentType.includes('TOOL')
                        || fragmentType.includes('PLUGIN')
                        || fragmentType.includes('FUNCTION')
                        || fragmentType.includes('STATUS')
                    ) {
                        // DeepSeek 深度搜索会把工具调用轨迹、提示语等混在 fragments 中，这些不应作为独立消息导出
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

    function aggregateDeepSeekMessagesForExport(messages) {
        const input = Array.isArray(messages) ? messages : [];
        const groups = [];
        const seenKeys = new Map();

        input.forEach((msg, idx) => {
            if (!msg || !msg.text) return;
            const role = String(msg.role || 'assistant');
            const sourceMessageId = String(msg.sourceMessageId || msg.id || idx + 1);
            const key = `${sourceMessageId}:${role}`;
            let group = seenKeys.get(key);
            if (!group) {
                group = {
                    key,
                    sourceMessageId,
                    role,
                    status: String(msg.status || ''),
                    userParts: [],
                    thoughtParts: [],
                    responseParts: [],
                    fallbackParts: []
                };
                seenKeys.set(key, group);
                groups.push(group);
            }

            const text = String(msg.text || '').trim();
            if (!text) return;

            if (role === 'user') {
                group.userParts.push(text);
                return;
            }

            const fragmentType = String(msg.fragmentType || '').toUpperCase();
            if (msg.isSearch || fragmentType === 'SEARCH') {
                return;
            }
            if (msg.isThought || fragmentType === 'THINK') {
                group.thoughtParts.push(text);
                return;
            }
            if (!fragmentType || fragmentType === 'RESPONSE' || fragmentType === 'MESSAGE') {
                group.responseParts.push(text);
                return;
            }
            if (
                fragmentType.includes('TOOL')
                || fragmentType.includes('FUNCTION')
                || fragmentType.includes('PLUGIN')
                || fragmentType.includes('STATUS')
                || fragmentType.includes('FINISHED')
                || fragmentType.includes('OPEN')
            ) {
                return;
            }
            group.fallbackParts.push(text);
        });

        const out = [];

        groups.forEach((group, idx) => {
            if (group.role === 'user') {
                const text = Array.from(new Set(group.userParts.filter(Boolean))).join('\n\n').trim();
                if (!text) return;
                out.push({
                    id: `deepseek-export-${group.sourceMessageId || idx + 1}`,
                    sourceMessageId: group.sourceMessageId,
                    role: 'user',
                    text,
                    status: group.status,
                    fragmentType: 'REQUEST',
                    isThought: false,
                    isSearch: false,
                    hasThought: false,
                    textWithoutThought: text
                });
                return;
            }

            const thoughtText = Array.from(new Set(group.thoughtParts.filter(Boolean))).join('\n\n').trim();
            const responseText = Array.from(new Set(group.responseParts.filter(Boolean))).join('\n\n').trim();
            const fallbackText = Array.from(new Set(group.fallbackParts.filter(Boolean))).join('\n\n').trim();
            if (thoughtText) {
                out.push({
                    id: `deepseek-export-${group.sourceMessageId || idx + 1}-think`,
                    sourceMessageId: group.sourceMessageId,
                    role: 'assistant',
                    text: thoughtText,
                    fullText: thoughtText,
                    status: group.status,
                    fragmentType: 'THINK',
                    isThought: true,
                    isSearch: false,
                    hasThought: true,
                    textWithoutThought: ''
                });
            }

            const finalText = responseText || fallbackText;
            if (finalText) {
                out.push({
                    id: `deepseek-export-${group.sourceMessageId || idx + 1}-response`,
                    sourceMessageId: group.sourceMessageId,
                    role: 'assistant',
                    text: finalText,
                    fullText: finalText,
                    status: group.status,
                    fragmentType: responseText ? 'RESPONSE' : 'MESSAGE',
                    isThought: false,
                    isSearch: false,
                    hasThought: Boolean(thoughtText),
                    textWithoutThought: finalText
                });
            }
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

    function parseDeepSeekTsValue(raw) {
        if (raw == null || raw === '') return { value: 0, text: '-' };
        const str = String(raw).trim();
        if (!str) return { value: 0, text: '-' };
        if (/^\d+(?:\.\d+)?$/.test(str)) {
            const num = Number(str);
            const intPart = str.split('.')[0] || '';
            const ms = intPart.length <= 10 ? num * 1000 : num;
            const dt = new Date(ms);
            return { value: ms, text: Number.isFinite(dt.getTime()) ? dt.toLocaleString() : str };
        }
        const parsed = Date.parse(str);
        if (Number.isFinite(parsed)) return { value: parsed, text: new Date(parsed).toLocaleString() };
        return { value: 0, text: str };
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

        const updatedNorm = parseDeepSeekTsValue(chatSession?.updated_at);
        const insertedNorm = parseDeepSeekTsValue(chatSession?.inserted_at);

        return {
            chatSession: chatSession
                ? {
                    id: String(chatSession.id || ''),
                    title: String(chatSession.title || ''),
                    titleType: String(chatSession.title_type || ''),
                    pinned: Boolean(chatSession.pinned),
                    updatedAt: updatedNorm.text,
                    updatedAtValue: updatedNorm.value,
                    updatedAtRaw: chatSession.updated_at == null ? '' : String(chatSession.updated_at),
                    seqId: chatSession.seq_id == null ? '' : String(chatSession.seq_id),
                    agent: String(chatSession.agent || ''),
                    version: chatSession.version == null ? '' : String(chatSession.version),
                    currentMessageId: chatSession.current_message_id == null ? '' : String(chatSession.current_message_id),
                    insertedAt: insertedNorm.text,
                    insertedAtValue: insertedNorm.value,
                    insertedAtRaw: chatSession.inserted_at == null ? '' : String(chatSession.inserted_at)
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
            console.warn('AI-Chat-Helper: DeepSeek 未找到会话 ID，无法请求 history_messages');
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
                console.warn(`AI-Chat-Helper: DeepSeek history_messages 请求失败 (${resp.status})`);
                return [];
            }

            const text = await resp.text();
            const json = safeParseDeepSeekJson(text);
            if (!json) {
                console.warn('AI-Chat-Helper: DeepSeek history_messages 返回非 JSON');
                return [];
            }

            deepseekLastSessionMeta = extractDeepSeekSessionMeta(json);

            const fragments = parseDeepSeekMessagesFromResponse(json);
            return aggregateDeepSeekMessagesForExport(fragments);
        } catch (e) {
            console.warn('AI-Chat-Helper: DeepSeek history_messages 解析失败', e);
            return [];
        }
    }

    function normalizeDeepSeekTextForMatch(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim();
    }

    function getDeepSeekDomRows() {
        const area = document.querySelector('.ds-virtual-list-visible-items') || document.body;
        return Array.from(area.querySelectorAll('._81e7b5e, .ds-message'));
    }

    function isDeepSeekUserRow(row) {
        return !!(row && (row.classList.contains('_19d617c') || (!row.querySelector('.ds-markdown') && !row.querySelector('.ds-think-content') && !row.querySelector('.ds-thought-content'))));
    }

    function scoreDeepSeekTextMatch(a, b) {
        const x = normalizeDeepSeekTextForMatch(a || '');
        const y = normalizeDeepSeekTextForMatch(b || '');
        if (!x || !y) return 0;
        if (x === y) return 100;
        let s = 0;
        const px = x.slice(0, Math.min(48, x.length));
        const py = y.slice(0, Math.min(48, y.length));
        if (px && y.includes(px)) s += 20;
        if (py && x.includes(py)) s += 20;
        const mx = x.slice(Math.max(0, Math.floor(x.length / 2) - 20), Math.floor(x.length / 2) + 20);
        if (mx && y.includes(mx)) s += 12;
        return s;
    }

    function scanDeepSeekDomNodes() {
        const out = [];
        const seen = new Set();
        const rows = getDeepSeekDomRows();
        rows.forEach((row, idx) => {
            if (!isDeepSeekUserRow(row)) return;
            const bubble = row.querySelector('._72b6158') || row.querySelector('.ds-message-item--content') || row;
            const text = normalizeDeepSeekTextForMatch(bubble?.innerText || row.innerText || '');
            if (!text || text === '深度思考' || text === '联网搜索') return;
            const rowId = String(row.closest?.('[data-virtual-list-item-key]')?.getAttribute?.('data-virtual-list-item-key') || row.getAttribute('data-virtual-list-item-key') || '').trim();
            const key = `${rowId}|${text.slice(0, 80)}`;
            if (seen.has(key)) return;
            seen.add(key);
            const assistantRows = [];
            for (let j = idx + 1; j < rows.length; j += 1) {
                if (isDeepSeekUserRow(rows[j])) break;
                assistantRows.push(rows[j]);
            }
            out.push({
                rowId,
                text,
                element: bubble || row,
                row,
                assistantRows,
                nodeId: '',
                apiIndex: -1
            });
        });
        deepseekDomNodesSnapshot = out;
        return out;
    }

    function rebindDeepSeekNodesToDom(nodeList, force = false) {
        if (!Array.isArray(nodeList) || !nodeList.length) {
            deepseekDomNodesSnapshot = [];
            return;
        }
        const domList = scanDeepSeekDomNodes();
        if (!domList.length) {
            nodeList.forEach((node) => {
                node.element = null;
                node.rowId = '';
                node._dsRow = null;
                node._dsAssistantRows = [];
            });
            return;
        }

        if (force) {
            domList.forEach((item) => {
                item.apiIndex = -1;
                item.nodeId = '';
            });
        }

        const used = new Set();
        domList.forEach((domNode) => {
            let best = -1;
            let score = 0;
            nodeList.forEach((node, idx) => {
                if (used.has(idx)) return;
                const s = scoreDeepSeekTextMatch(domNode.text, node.text);
                if (s > score) {
                    score = s;
                    best = idx;
                }
            });
            if (best !== -1 && score >= 20) {
                domNode.apiIndex = best;
                domNode.nodeId = String(nodeList[best]?.id || '');
                used.add(best);
            }
        });

        nodeList.forEach((node, idx) => {
            const hit = domList.find((item) => item.apiIndex === idx) || null;
            node.element = hit?.element || null;
            node.rowId = String(hit?.rowId || '');
            node._dsRow = hit?.row || null;
            node._dsAssistantRows = Array.isArray(hit?.assistantRows) ? hit.assistantRows : [];
        });
    }

    function getDeepSeekNodeGroupRange(node) {
        const user = node?._dsRow || node?.element;
        if (!user || !document.body.contains(user)) return null;
        const ur = user.getBoundingClientRect();
        let top = ur.top;
        let bottom = ur.bottom;
        const assistants = Array.isArray(node?._dsAssistantRows) ? node._dsAssistantRows : [];
        for (let i = assistants.length - 1; i >= 0; i -= 1) {
            const a = assistants[i];
            if (!a || !document.body.contains(a)) continue;
            const ar = a.getBoundingClientRect();
            bottom = Math.max(bottom, ar.bottom);
            break;
        }
        return { top, bottom, mid: (top + bottom) / 2 };
    }

    function getDeepSeekReadingY(scrollEl) {
        const offset = Math.max(10, Math.min(500, CONFIG.readingLineOffset || 150));
        return offset;
    }

    function getDeepSeekNodeAlignY(node, scrollEl) {
        const range = getDeepSeekNodeGroupRange(node);
        if (range) return range.top + 8;
        const el = node?.element;
        if (!el || !document.body.contains(el)) return getDeepSeekReadingY(scrollEl);
        const rect = el.getBoundingClientRect();
        return rect.top + Math.min(Math.max(rect.height * 0.2, 10), 48);
    }

    function findDeepSeekDomElementByNode(node) {
        if (!node) return null;
        const list = Array.isArray(nodes) && nodes.length ? nodes : [];
        if (list.length) rebindDeepSeekNodesToDom(list, true);
        const direct = list.find((n) => String(n?.id || '') === String(node?.id || '')) || null;
        if (direct?.element && document.body.contains(direct.element)) return direct.element;

        const candidates = deepseekDomNodesSnapshot.length ? deepseekDomNodesSnapshot : scanDeepSeekDomNodes();
        if (!candidates.length) return null;

        const targetText = normalizeDeepSeekTextForMatch(node?.text || '');
        const targetId = String(node?.sourceMessageId || '').trim();
        let best = null;
        let bestScore = 0;
        candidates.forEach((c) => {
            let score = 0;
            if (targetId && String(c?.rowId || '').trim() === targetId) score += 70;
            score += scoreDeepSeekTextMatch(targetText, c?.text || '');
            if (score > bestScore) {
                bestScore = score;
                best = c;
            }
        });
        return bestScore >= 20 ? (best?.element || null) : null;
    }

    function getDeepSeekActiveNodeByConversationState(scrollEl) {
        if (!Array.isArray(nodes) || !nodes.length) return null;
        rebindDeepSeekNodesToDom(nodes, true);
        const ry = getDeepSeekReadingY(scrollEl);
        let hit = null;
        let bestTop = -Infinity;
        nodes.forEach((node) => {
            const range = getDeepSeekNodeGroupRange(node);
            if (!range) return;
            if (range.bottom < 0 || range.top > window.innerHeight) return;
            if (range.top <= ry && range.bottom >= ry && range.top > bestTop) {
                bestTop = range.top;
                hit = node;
            }
        });
        return hit;
    }

    function getDeepSeekLiveDomNodes() {
        const usable = (Array.isArray(deepseekDomNodesSnapshot) ? deepseekDomNodesSnapshot : [])
            .filter((n) => n?.element && document.body.contains(n.element));
        return usable.length ? usable : scanDeepSeekDomNodes();
    }

    function getDeepSeekDomProgressSignature(scrollEl) {
        const list = scanDeepSeekDomNodes();
        const top = (scrollEl && scrollEl !== window && scrollEl !== document.documentElement && scrollEl !== document.scrollingElement)
            ? Number(scrollEl.scrollTop || 0)
            : Number(window.scrollY || 0);
        return `${list.length}|${list[0]?.rowId || ''}|${list[list.length - 1]?.rowId || ''}|${Math.round(top)}`;
    }

    function scrollDeepSeekBy(scrollEl, delta) {
        if (scrollEl && scrollEl !== window && scrollEl !== document.documentElement && scrollEl !== document.scrollingElement) {
            const before = Number(scrollEl.scrollTop || 0);
            scrollEl.scrollTop = before + delta;
            const after = Number(scrollEl.scrollTop || 0);
            return after - before;
        }
        const before = Number(window.scrollY || document.documentElement.scrollTop || 0);
        window.scrollBy(0, delta);
        const after = Number(window.scrollY || document.documentElement.scrollTop || 0);
        return after - before;
    }

    function getDeepSeekScrollMetrics(scrollEl) {
        const isWindowScroll = !scrollEl || scrollEl === window || scrollEl === document.documentElement || scrollEl === document.scrollingElement;
        if (isWindowScroll) {
            const root = document.scrollingElement || document.documentElement || document.body;
            const top = Number(window.scrollY || root?.scrollTop || 0);
            const maxTop = Math.max(0, Number((root?.scrollHeight || 0) - (window.innerHeight || 0)));
            return { top, maxTop };
        }
        const top = Number(scrollEl.scrollTop || 0);
        const maxTop = Math.max(0, Number((scrollEl.scrollHeight || 0) - (scrollEl.clientHeight || 0)));
        return { top, maxTop };
    }

    async function findDeepSeekTargetWithDirectionalScroll(targetNode, targetApiIndex, token = 0) {
        rebindDeepSeekNodesToDom(nodes, true);
        let target = getDeepSeekLiveDomNodes().find((n) => String(n?.nodeId || '') === String(targetNode?.id || '')) || null;
        if (target?.element && target.element.isConnected) return target.element;

        const scrollEl = getScrollContainer();
        const viewportH = (scrollEl && scrollEl !== window && scrollEl !== document.documentElement && scrollEl !== document.scrollingElement)
            ? Number(scrollEl.clientHeight || window.innerHeight || 700)
            : Number(window.innerHeight || 700);
        const step = Math.max(220, Math.round(viewportH * 0.72));
        const activeIdx = nodes.findIndex((n) => String(n?.id || '') === String(activeNodeId || ''));
        const down = activeIdx >= 0 ? targetApiIndex >= activeIdx : true;

        let stale = 0;
        let lastSig = '';
        const startedAt = Date.now();
        while (Date.now() - startedAt < 45000) {
            if (token !== deepseekNavJumpSeq) return null;
            scrollDeepSeekBy(scrollEl, down ? step : -step);
            await new Promise((resolve) => setTimeout(resolve, 180));
            if (token !== deepseekNavJumpSeq) return null;

            rebindDeepSeekNodesToDom(nodes, true);
            target = getDeepSeekLiveDomNodes().find((n) => String(n?.nodeId || '') === String(targetNode?.id || '')) || null;
            if (target?.element && target.element.isConnected) return target.element;

            const nowSig = getDeepSeekDomProgressSignature(scrollEl);
            stale = nowSig === lastSig ? stale + 1 : 0;
            lastSig = nowSig;
            if (stale >= 4) break;
        }
        return null;
    }

    async function alignDeepSeekNodeToReadingLine(targetNode, token = 0) {
        const scrollEl = getScrollContainer();
        for (let i = 0; i < 6; i += 1) {
            if (token !== deepseekNavJumpSeq) return false;
            rebindDeepSeekNodesToDom(nodes, true);
            const liveNode = (nodesMap.get(String(targetNode?.id || '')) || targetNode || null);
            if (!liveNode) return false;
            const alignY = getDeepSeekNodeAlignY(liveNode, scrollEl);
            const readingY = getDeepSeekReadingY(scrollEl);
            const delta = alignY - readingY;
            if (Math.abs(delta) <= 8) return true;
            const metricsBefore = getDeepSeekScrollMetrics(scrollEl);
            const moved = Number(scrollDeepSeekBy(scrollEl, Math.max(-520, Math.min(520, delta))) || 0);
            await new Promise((resolve) => setTimeout(resolve, i < 2 ? 180 : 100));
            const metricsAfter = getDeepSeekScrollMetrics(scrollEl);

            const noMove = Math.abs(moved) < 1 || Math.abs(metricsAfter.top - metricsBefore.top) < 1;
            if (noMove) {
                const atTop = metricsAfter.top <= 1;
                const atBottom = metricsAfter.top >= metricsAfter.maxTop - 1;
                const blockedByTop = delta < 0 && atTop;
                const blockedByBottom = delta > 0 && atBottom;
                if (blockedByTop || blockedByBottom) {
                    // 边界可达性限制：已尽可能贴近阅读线，允许结束。
                    return true;
                }
            }
        }
        return true;
    }

    async function jumpToDeepSeekNodeById(nodeId) {
        const token = ++deepseekNavJumpSeq;
        const targetIndex = nodes.findIndex((n) => String(n?.id || '') === String(nodeId || ''));
        const targetNode = targetIndex >= 0 ? nodes[targetIndex] : (nodesMap.get(String(nodeId || '')) || null);
        if (!targetNode) return false;

        const targetEl = await findDeepSeekTargetWithDirectionalScroll(targetNode, targetIndex, token);
        if (token !== deepseekNavJumpSeq) return false;
        if (!targetEl || !targetEl.isConnected) return false;

        targetNode.element = targetEl;
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise((resolve) => setTimeout(resolve, 220));
        if (token !== deepseekNavJumpSeq) return false;
        await alignDeepSeekNodeToReadingLine(targetNode, token);
        if (token !== deepseekNavJumpSeq) return false;
        await new Promise((resolve) => setTimeout(resolve, 120));
        if (token !== deepseekNavJumpSeq) return false;
        await alignDeepSeekNodeToReadingLine(targetNode, token);
        if (token !== deepseekNavJumpSeq) return false;

        highlightMessage(targetEl);
        scheduleActiveNodeUpdate();
        return true;
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
                // 采用聚合后的 ID 来源，确保一轮对话仅有一个节点
                const rawId = m.sourceMessageId || (typeof m.id === 'string' && m.id.includes('export-') ? m.id.split('export-')[1] : m.id) || String(idx + 1);
                const id = `deepseek-user-${rawId}`;
                return {
                    id,
                    sourceMessageId: String(rawId || ''),
                    role: 'user',
                    text,
                    sessionIndex: idx,
                    rowId: '',
                    element: null,
                    _dsRow: null,
                    _dsAssistantRows: []
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
            console.warn('AI-Chat-Helper: DeepSeek 虚拟节点刷新失败', e);
        }).finally(() => {
            deepseekVirtualNodesLoading = false;
        });
    }

    function buildDoubaoVirtualNodesFromApi(apiMsgs) {
        const convIdFromPath = String((String(window.location.pathname || '').match(/\/chat\/(\d+)/i) || [])[1] || '').trim();
        const convId = String(convIdFromPath || currentConvId || 'default');
        const userMsgs = (Array.isArray(apiMsgs) ? apiMsgs : []).filter((m) => m && m.role === 'user' && m.text);
        if (!userMsgs.length) return [];

        const out = [];
        const seen = new Set();
        userMsgs.forEach((m, idx) => {
            // 这里不能依赖后段定义的导出函数，避免初始化阶段 ReferenceError。
            const text = sanitizeDoubaoUserNodeText(String(m.text || '').trim());
            if (!text) return;

            const sourceMessageId = String(m?.sourceMessageId || m?.id || '').trim();
            const fallbackStable = hashStr(`${idx + 1}|${text}`).slice(0, 8);
            const id = sourceMessageId || `doubao-user-${convId}-${idx + 1}-${fallbackStable}`;
            if (!id || seen.has(id)) return;
            seen.add(id);
            out.push({
                id,
                role: 'user',
                text,
                sourceMessageId,
                // 性能优化：批量刷新时不做逐条 DOM 反查，跳转时再惰性定位。
                element: null
            });
        });

        return out;
    }

    function scheduleDoubaoVirtualNodesRefresh(force = false) {
        if (!isDoubao || doubaoVirtualNodesLoading) return;

        const now = Date.now();
        const retryGap = doubaoVirtualNodesCache.length ? 1800 : 700;
        if (!force && (now - doubaoVirtualNodesLastFetchAt < retryGap)) return;

        doubaoVirtualNodesLoading = true;
        doubaoVirtualNodesLastFetchAt = now;
        const refreshStorageKey = storageKey;

        getDoubaoMessagesByApi().then((apiMsgs) => {
            if (refreshStorageKey !== storageKey) return;
            const built = buildDoubaoVirtualNodesFromApi(apiMsgs);
            if (!built.length) {
                doubaoVirtualNodesLoaded = true;
                doubaoVirtualNodesDirty = true;
                return;
            }

            doubaoVirtualNodesCache = built;
            doubaoVirtualNodesLoaded = true;
            doubaoVirtualNodesDirty = false;
            reconcileDoubaoPendingDomNodesWithApi();
            requestAnimationFrame(() => {
                update();
                kickstartActiveNodeAutoSync();
            });
        }).catch((e) => {
            console.warn('AI-Chat-Helper: 豆包虚拟节点刷新失败', e);
        }).finally(() => {
            if (refreshStorageKey !== storageKey) return;
            doubaoVirtualNodesLoading = false;
        });
    }

    function jumpToMessage(el, nodeId) {
        if (isQwen && nodeId) {
            jumpToQwenNodeById(nodeId).then((ok) => {
                if (!ok) {
                    console.warn(`AI-Chat-Helper: 千问跳转未命中目标节点 ${nodeId}`);
                    hideJumpToast();
                }
            }).catch((e) => {
                console.warn('AI-Chat-Helper: 千问跳转异常', e);
                hideJumpToast();
            });
            return true;
        }
        if (isDoubao && nodeId) {
            jumpToDoubaoNodeById(nodeId).then((ok) => {
                if (!ok) {
                    console.warn(`AI-Chat-Helper: 豆包跳转未命中目标节点 ${nodeId}`);
                    hideJumpToast();
                }
            }).catch((e) => {
                console.warn('AI-Chat-Helper: 豆包跳转异常', e);
                hideJumpToast();
            });
            return true;
        }
        if (isDeepSeek && nodeId) {
            jumpToDeepSeekNodeById(nodeId).then((ok) => {
                if (!ok) {
                    console.warn(`AI-Chat-Helper: DeepSeek 跳转未命中目标节点 ${nodeId}`);
                    hideJumpToast();
                }
            }).catch((e) => {
                console.warn('AI-Chat-Helper: DeepSeek 跳转异常', e);
                hideJumpToast();
            });
            return true;
        }

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
        
        // 核心加固：验证 DOM 节点是否被“回收复用” (Virtual List 防抖)
        const isElementValid = (element, expectedNode) => {
            if (!element || !element.isConnected) return false;
            if (isQwen) {
                const row = getQwenRowFromElement(element);
                const rows = getQwenConversationRows();
                const resolvedNode = row ? resolveQwenNodeFromRow(row, rows) : null;
                if (resolvedNode) {
                    return String(resolvedNode.id || '') === String(expectedNode?.id || '');
                }
                return false;
            }
            if (isDeepSeek) return false;
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
            if (targetEl && !isElementValid(targetEl, node)) {
                targetEl = null;
            }
        }

        // 如果仍然没有找到有效节点（说明目标已彻底不在当前视口内），启动深度搜寻
        if (!targetEl) {
            console.warn(`AI-Chat-Helper: 目标节点 ${nodeId} 已被回收或不在视野内，启动深度搜寻...`);
            startNodeSearch(nodeId);
            return false;
        }
        
        const scrollEl = getScrollContainer();
        const executeJump = () => {
            const containerRect = (scrollEl === window || scrollEl === document.documentElement) 
                ? { top: 0 } 
                : scrollEl.getBoundingClientRect();
            const readingLineOffset = Math.max(10, Math.min(500, CONFIG.readingLineOffset || 150));
            const currentTop = (scrollEl === window || scrollEl === document.documentElement || scrollEl === document.scrollingElement)
                ? (window.scrollY || document.documentElement.scrollTop || 0)
                : (scrollEl.scrollTop || 0);
            let alignY = null;
            if (isDeepSeek && node) {
                alignY = getDeepSeekNodeAlignY(node, scrollEl);
            } else {
                const rect = targetEl.getBoundingClientRect();
                alignY = rect.top;
            }
            const targetTop = currentTop + alignY - containerRect.top - readingLineOffset;
            
            if (typeof scrollEl.scrollTo === 'function') {
                scrollEl.scrollTo({ top: targetTop, behavior: 'smooth' });
            } else {
                window.scrollTo({ top: targetTop, behavior: 'smooth' });
            }
        };

        if (scrollEl) {
            executeJump();
            // DeepSeek 保留二次校正；Qwen 关闭，避免点击后被页面自动带回旧位置。
            // DeepSeek 已走独立跳转链路，不在通用路径做二次校正。
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

    function normalizeQwenMessageId(rawId) {
        const id = String(rawId || '').trim();
        if (!id) return '';
        return id
            .replace(/-(question|answer)$/i, '')
            .replace(/-(u|a)-\d+$/i, '')
            .trim();
    }

    function sanitizeQwenCachedNodes(rawList) {
        if (!Array.isArray(rawList) || !rawList.length) {
            return { nodes: [], changed: false, legacyFound: false };
        }

        const byId = new Map();
        let changed = false;
        let legacyFound = false;

        rawList.forEach((item, idx) => {
            const rawId = String(item?.id || '').trim();
            const normalizedId = normalizeQwenMessageId(rawId);
            const rawText = String(item?.text || '');
            const text = normalizeQwenTextForMatch(rawText);
            const role = String(item?.role || 'user').toLowerCase();

            if (!normalizedId || !text || role !== 'user') {
                changed = true;
                return;
            }

            if (rawId !== normalizedId || /-(u|a)-\d+$/i.test(rawId) || /-(question|answer)$/i.test(rawId)) {
                legacyFound = true;
                changed = true;
            }

            const sessionIndex = getQwenSessionIndexValue(item?.sessionIndex) !== -1
                ? getQwenSessionIndexValue(item.sessionIndex)
                : idx;

            const prev = byId.get(normalizedId);
            if (!prev) {
                byId.set(normalizedId, {
                    id: normalizedId,
                    role: 'user',
                    text,
                    sessionIndex,
                    element: null,
                    isHistory: true,
                    isLinked: true
                });
                return;
            }

            changed = true;
            if (text.length > String(prev.text || '').length) {
                prev.text = text;
            }
            if (sessionIndex < prev.sessionIndex) {
                prev.sessionIndex = sessionIndex;
            }
        });

        const nodes = Array.from(byId.values())
            .sort((a, b) => getQwenSessionIndexValue(a.sessionIndex) - getQwenSessionIndexValue(b.sessionIndex))
            .map((item, idx) => ({ ...item, sessionIndex: idx }));

        if (nodes.length !== rawList.length) changed = true;
        return { nodes, changed, legacyFound };
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

    function getQwenSessionIndexValue(value) {
        const n = Number(value);
        return Number.isInteger(n) && n >= 0 ? n : -1;
    }

    function getQwenAttachmentNamesFromRow(row) {
        if (!row) return [];
        const out = [];
        const seen = new Set();
        const pushName = (text) => {
            const clean = normalizeQwenTextForMatch(text);
            if (!clean) return;
            if (/^\d+(\.\d+)?\s*(kb|mb|gb|tb)$/i.test(clean)) return;
            if (/^(查看|预览|删除|上传|下载)$/i.test(clean)) return;
            if (seen.has(clean)) return;
            seen.add(clean);
            out.push(clean);
        };

        const nameNodes = row.querySelectorAll(
            '[class*="filesContainer"] [class*="fileContent"] [class*="title"], ' +
            '[class*="filesContainer"] [class*="fileBox"] [class*="title"], ' +
            '[class*="filesContainer"] span[class*="title-"], ' +
            '[data-file-name]'
        );
        nameNodes.forEach((el) => {
            pushName(el?.getAttribute?.('data-file-name') || '');
            pushName(el?.innerText || el?.textContent || '');
        });

        return out;
    }

    function sanitizeQwenQuestionText(text, fileNames = []) {
        let cleaned = normalizeQwenTextForMatch(text || '');
        if (!cleaned) return '';
        fileNames.forEach((name) => {
            const normalized = normalizeQwenTextForMatch(name);
            if (!normalized) return;
            cleaned = cleaned.split(normalized).join(' ');
        });
        cleaned = cleaned
            .replace(/\b\d+(\.\d+)?\s*(kb|mb|gb|tb)\b/ig, ' ')
            .replace(/\b(查看|预览|删除|编辑|复制|上传|下载)\b/ig, ' ');
        return normalizeQwenTextForMatch(cleaned);
    }

    function extractQwenPromptTextByWalker(root, fileNames = []) {
        if (!root) return '';
        const skipSelector = [
            '[class*="filesContainer"]',
            '[class*="fileBox"]',
            '[class*="fileContent"]',
            '[class*="statusLine"]',
            'button',
            'svg',
            '[data-role="icon"]',
            '[class*="group-hover"]'
        ].join(',');
        const texts = [];
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
        let node = walker.nextNode();
        while (node) {
            const parent = node.parentElement;
            if (parent && !parent.closest(skipSelector)) {
                const cleaned = sanitizeQwenQuestionText(node.nodeValue || '', fileNames);
                if (cleaned) texts.push(cleaned);
            }
            node = walker.nextNode();
        }
        if (!texts.length) return '';
        return normalizeQwenTextForMatch(texts.join(' '));
    }

    function getQwenPromptTextFromRow(row, fileNames = []) {
        if (!row) return '';
        const selectorCandidates = [
            '[class*="contentBox"] [class*="bubble"]',
            '[class*="contentBox"] [class*="text"]',
            '[class*="contentBox"]',
            '[class*="bubble"]'
        ];

        for (const selector of selectorCandidates) {
            const nodes = Array.from(row.querySelectorAll(selector));
            for (const node of nodes) {
                const cleaned = sanitizeQwenQuestionText(node?.innerText || node?.textContent || '', fileNames);
                if (cleaned) return cleaned;
            }
        }

        const walkerRoots = [
            row.querySelector('[class*="contentBox"]'),
            row.querySelector('[class*="content-"]'),
            row
        ].filter(Boolean);
        for (const root of walkerRoots) {
            const text = extractQwenPromptTextByWalker(root, fileNames);
            if (text) return text;
        }

        const clone = row.cloneNode(true);
        [
            '[class*="filesContainer"]',
            '[class*="fileBox"]',
            '[class*="fileContent"]',
            '[class*="statusLine"]',
            'button',
            'svg',
            '[data-role="icon"]'
        ].forEach((selector) => {
            clone.querySelectorAll(selector).forEach((el) => el.remove());
        });
        return sanitizeQwenQuestionText(clone.innerText || clone.textContent || '', fileNames);
    }

    function getQwenQuestionTextFromRow(row) {
        if (!row) return '';
        const fileNames = getQwenAttachmentNamesFromRow(row);
        const attachLines = fileNames.map((name, idx) => `[附件${fileNames.length > 1 ? idx + 1 : ''}] ${name}`);
        const bubbleText = getQwenPromptTextFromRow(row, fileNames);
        const lines = [...attachLines];
        if (bubbleText) lines.push(bubbleText);
        return normalizeQwenTextForMatch(lines.join('\n'));
    }

    function getQwenUserDomCandidates() {
        const rawElements = getQwenConversationRows().filter((row) => getQwenRowType(row) === 'question');
        const seen = new Set();
        const out = [];

        rawElements.forEach((row, questionIndex) => {
            const bubble = row.querySelector('[class*="contentBox"] [class*="bubble"]')
                || row.querySelector('[class*="bubble"]')
                || row.querySelector('[class*="contentBox"]')
                || row;
            const text = getQwenQuestionTextFromRow(row) || normalizeQwenTextForMatch(bubble.innerText || '');
            if (!text) return;

            const rawId = normalizeQwenMessageId(
                row.getAttribute('data-msgid')
                || row.getAttribute('data-msg-id')
                || row.getAttribute('data-id')
                || ''
            );

            const key = `${rawId}::${text.slice(0, 80)}`;
            if (seen.has(key)) return;
            seen.add(key);

            out.push({ id: rawId, element: bubble, text, sessionIndex: questionIndex });
        });

        return out;
    }

    function hasQwenApiNodeForDom(sourceMessageId, text) {
        const sid = normalizeQwenMessageId(sourceMessageId || '');
        const t = normalizeQwenTextForMatch(text || '');
        return qwenVirtualNodesCache.some((n) => {
            const nid = normalizeQwenMessageId(n?.sourceMessageId || n?.id || '');
            const nt = normalizeQwenTextForMatch(n?.text || '');
            if (sid && nid && (sid === nid || sid.includes(nid) || nid.includes(sid))) return true;
            if (!t || !nt) return false;
            if (nt === t) return true;
            const p = t.slice(0, Math.min(24, t.length));
            return Boolean(p && nt.includes(p));
        });
    }

    function reconcileQwenPendingDomNodesWithApi() {
        if (!Array.isArray(qwenPendingDomNodes) || !qwenPendingDomNodes.length) return;
        const next = [];
        const seen = new Set();
        qwenPendingDomNodes.forEach((n) => {
            if (!n) return;
            const id = String(n.id || '').trim();
            const sid = normalizeQwenMessageId(n.sourceMessageId || '');
            const txt = normalizeQwenTextForMatch(n.text || '');
            if (hasQwenApiNodeForDom(sid, txt)) return;
            const key = `${sid || id}::${txt.slice(0, 64)}`;
            if (seen.has(key)) return;
            seen.add(key);
            next.push(n);
        });
        qwenPendingDomNodes = next;
    }

    function upsertQwenPendingNodeFromDom() {
        const rows = getQwenConversationRows();
        let added = 0;
        let questionIndex = -1;
        rows.forEach((row, idx) => {
            if (getQwenRowType(row) !== 'question') return;
            questionIndex += 1;
            const baseId = getQwenRowId(row);
            const text = getQwenQuestionTextFromRow(row);
            if (!text) return;
            if (hasQwenApiNodeForDom(baseId, text)) return;
            const id = `dom-pending-qwen-${baseId || idx + 1}-${hashStr(text).slice(0, 8)}`;
            if (qwenPendingDomNodes.some((n) => String(n?.id || '') === id)) return;
            qwenPendingDomNodes.push({
                id,
                sourceMessageId: baseId || '',
                role: 'user',
                text: normalizeQwenTextForMatch(text),
                sessionIndex: questionIndex >= 0 ? questionIndex : idx,
                element: null,
                pendingDomOnly: true
            });
            added += 1;
        });
        if (added > 0) requestAnimationFrame(() => update());
    }

    function hasQwenCompletedAnswerForQuestion(baseId) {
        if (!baseId) return false;
        const rows = getQwenConversationRows();
        const answerRows = rows.filter((row) => getQwenRowType(row) === 'answer' && getQwenRowId(row) === baseId);
        if (!answerRows.length) return false;
        return answerRows.some((row) => {
            if (!row || !row.isConnected) return false;
            if (row.querySelector('[aria-busy="true"], [class*="typing"], [class*="loading"], [class*="stream"], [class*="generating"]')) return false;
            const txt = normalizeQwenTextForMatch(row.innerText || '');
            if (!txt) return false;
            if (/^(思考中|生成中|回答中|typing|loading)\b/i.test(txt)) return false;
            return txt.length >= 2;
        });
    }

    async function runQwenAutoApiRefreshFromDom() {
        if (!isQwen || qwenAutoApiRefreshInFlight) return;
        const now = Date.now();
        if (now - qwenLastAutoApiRefreshAt < 1200) return;
        const pending = qwenPendingDomNodes.filter((n) => n && n.pendingDomOnly);
        if (!pending.length) return;
        const ready = pending.some((n) => hasQwenCompletedAnswerForQuestion(normalizeQwenMessageId(n.sourceMessageId || '')));
        if (!ready) return;

        qwenAutoApiRefreshInFlight = true;
        qwenLastAutoApiRefreshAt = now;
        try {
            const list = await getQwenMessagesByApi();
            if (Array.isArray(list) && list.length) {
                applyQwenApiMessagesToCache(list, 'dom-auto-refresh', getQwenSessionIdFromUrl());
            } else {
                scheduleQwenVirtualNodesRefresh(true);
            }
            reconcileQwenPendingDomNodesWithApi();
            requestAnimationFrame(() => update());
        } catch (e) {
            console.warn('AI-Chat-Helper: 千问 DOM 驱动自动刷新失败', e);
        } finally {
            qwenAutoApiRefreshInFlight = false;
        }
    }

    function scheduleQwenDomDrivenSync() {
        if (!isQwen) return;
        if (qwenDomMutationDebounceTimer) clearTimeout(qwenDomMutationDebounceTimer);
        qwenDomMutationDebounceTimer = setTimeout(() => {
            qwenDomMutationDebounceTimer = null;
            try {
                upsertQwenPendingNodeFromDom();
                if (qwenAutoApiRefreshTimer) clearTimeout(qwenAutoApiRefreshTimer);
                qwenAutoApiRefreshTimer = setTimeout(() => {
                    qwenAutoApiRefreshTimer = null;
                    runQwenAutoApiRefreshFromDom();
                }, 900);
            } catch (_) {
                // ignore
            }
        }, 220);
    }

    function getQwenConversationRows() {
        const selector = [
            '[class*="questionItem"]',
            '[class*="answerItem"]',
            '[class*="message-item"]',
            '[class*="messageItem"]',
            '[class*="chat-item"]',
            '[data-msgid]',
            '[data-msg-id]'
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
        if (!row) return 'unknown';
        const msgIdRaw = String(row.getAttribute('data-msgid') || row.getAttribute('data-msg-id') || '').toLowerCase();
        if (msgIdRaw.endsWith('-question')) return 'question';
        if (msgIdRaw.endsWith('-answer')) return 'answer';
        const cls = String(row.className || '').toLowerCase();
        // 启发式角色判断：兼容多种常见的类名命名模式
        if (cls.includes('answeritem')) return 'answer';
        if (cls.includes('question') || cls.includes('user') || cls.includes('human') || cls.includes('sender')) return 'question';
        if (cls.includes('answer') || cls.includes('assistant') || cls.includes('bot') || cls.includes('reply')) return 'answer';
        
        // 结构特征辅助判断
        if (row.querySelector('[class*="user"], [class*="human"], [class*="User"]')) return 'question';
        if (row.querySelector('[class*="assistant"], [class*="bot"], [class*="Ai"]')) return 'answer';
        
        return 'unknown';
    }

    function getQwenRowId(row) {
        return normalizeQwenMessageId(String(
            row?.getAttribute?.('data-msgid')
            || row?.getAttribute?.('data-msg-id')
            || row?.getAttribute?.('data-id')
            || row?.id
            || ''
        ).trim());
    }

    function getQwenRowText(row) {
        if (!row) return '';
        if (getQwenRowType(row) === 'question') {
            return getQwenQuestionTextFromRow(row);
        }
        const bubble = row.querySelector('[class*="bubble"]') || row.querySelector('[class*="contentBox"]') || row;
        return normalizeQwenTextForMatch(bubble.innerText || '');
    }

    function getQwenRowFromElement(element) {
        if (!element || !element.closest) return null;
        return element.closest('[class*="questionItem"], [class*="answerItem"], [class*="question-item"], [class*="answer-item"]');
    }

    function findQwenNodeBySignature(id, text, sessionIndex = -1) {
        const normalizedId = normalizeQwenMessageId(id);
        const normalizedSessionIndex = getQwenSessionIndexValue(sessionIndex);
        if (normalizedId) {
            const bySource = nodes.find((n) => {
                const nid = normalizeQwenMessageId(String(n?.sourceMessageId || n?.id || ''));
                if (nid !== normalizedId) return false;
                if (normalizedSessionIndex === -1) return true;
                return getQwenSessionIndexValue(n?.sessionIndex) === normalizedSessionIndex;
            });
            if (bySource) return bySource;
        }

        const normalized = normalizeQwenTextForMatch(text || '');
        const prefix = normalized.slice(0, Math.min(28, normalized.length));
        let bestNode = null;
        let bestScore = -1;

        nodes.forEach((n) => {
            const t = normalizeQwenTextForMatch(n.text || '');
            if (!t) return;

            let score = 0;
            if (normalizedId && normalizeQwenMessageId(String(n?.sourceMessageId || n?.id || '')) === normalizedId) score += 18;
            if (normalized && t === normalized) score += 14;
            if (prefix && t.includes(prefix)) score += 8;
            if (normalized && t && normalized.includes(t.slice(0, Math.min(24, t.length)))) score += 3;

            const nodeSessionIndex = getQwenSessionIndexValue(n.sessionIndex);
            if (normalizedSessionIndex !== -1 && nodeSessionIndex !== -1) {
                const distance = Math.abs(nodeSessionIndex - normalizedSessionIndex);
                if (distance === 0) score += 18;
                else if (distance === 1) score += 10;
                else if (distance === 2) score += 5;
            }

            if (score > bestScore) {
                bestScore = score;
                bestNode = n;
            }
        });

        return bestScore >= 8 ? bestNode : null;
    }

    function getQwenQuestionSessionIndexFromRows(rows, row) {
        if (!row || !Array.isArray(rows) || !rows.length) return -1;
        let questionIndex = -1;
        for (const currentRow of rows) {
            if (getQwenRowType(currentRow) === 'question') {
                questionIndex += 1;
            }
            if (currentRow === row) {
                return questionIndex;
            }
        }
        return -1;
    }

    function resolveQwenNodeFromRow(row, rows) {
        if (!row) return null;
        const rowType = getQwenRowType(row);
        const questionRows = Array.isArray(rows) ? rows.filter((item) => getQwenRowType(item) === 'question') : [];
        const canUseGlobalSessionIndex = questionRows.length > 0 && questionRows.length === nodes.length;
        const idx = rows.indexOf(row);
        const rowId = getQwenRowId(row);

        // 先按统一消息 ID 直接映射：question/answer 共享同一基础 req_id。
        // 例如：
        // data-msgid="6687456e...-question"
        // data-msgid="6687456e...-answer"
        // 两者都应激活同一个用户节点。
        if (rowId) {
            const directById = findQwenNodeBySignature(rowId, '', -1);
            if (directById) return directById;
        }

        // 如果不是明确的问题行，则向上游溯源至最近的问题起点
        // 这一逻辑可以自动关联“该提问产生的全套内容”，包括思考中、代码执行、已完成的回复等
        if (rowType !== 'question' && idx !== -1) {
            for (let i = idx - 1; i >= 0; i--) {
                if (getQwenRowType(rows[i]) === 'question') {
                    return resolveQwenNodeFromRow(rows[i], rows);
                }
            }
        }

        const directQuestionIndex = canUseGlobalSessionIndex
            ? getQwenQuestionSessionIndexFromRows(rows, row)
            : -1;

        return findQwenNodeBySignature(
            rowId,
            getQwenRowText(row),
            directQuestionIndex
        );
    }

    function getQwenActiveNodeByConversationState(scrollEl) {
        const rows = getQwenConversationRows();
        if (!rows.length) return null;

        const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0);
        const visibleRows = rows.filter((row) => {
            const rect = row.getBoundingClientRect();
            return rect.bottom > 0 && rect.top < viewportHeight;
        });
        const candidateRows = visibleRows.length ? visibleRows : rows;
        const readingAnchor = CONFIG.readingLineOffset;

        const isNearBottom = Boolean(scrollEl)
            && ((scrollEl.scrollHeight - Math.max(0, Number(scrollEl.scrollTop || 0)) - scrollEl.clientHeight) < 140);
        if (isNearBottom && candidateRows.length) {
            return resolveQwenNodeFromRow(candidateRows[candidateRows.length - 1], rows);
        }

        let crossingRow = null;
        for (const row of candidateRows) {
            const rect = row.getBoundingClientRect();
            if (rect.top <= readingAnchor && rect.bottom >= readingAnchor) {
                crossingRow = row;
                break;
            }
        }
        if (crossingRow) {
            return resolveQwenNodeFromRow(crossingRow, rows);
        }

        let bestRow = null;
        let bestScore = -Infinity;
        candidateRows.forEach((row) => {
            const rect = row.getBoundingClientRect();
            if (!(rect.bottom > 0 && rect.top < viewportHeight)) return;

            // 优先当前阅读线之上的最近一条，其次才考虑阅读线之下的条目。
            let score = 0;
            if (rect.top <= readingAnchor) {
                score = 2000 - Math.abs(readingAnchor - rect.top);
            } else {
                score = 1000 - Math.abs(rect.top - readingAnchor);
            }

            if (score > bestScore) {
                bestScore = score;
                bestRow = row;
            }
        });

        if (!bestRow) return null;
        return resolveQwenNodeFromRow(bestRow, rows);
    }

    function normalizeDoubaoTextForMatch(text) {
        return String(text || '')
            .replace(/\s+/g, ' ')
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim();
    }

    function normalizeDoubaoMessageId(rawId) {
        const id = String(rawId || '').trim();
        if (!id) return '';
        return id
            .replace(/[-_:]?(question|answer|assistant|receive|send)$/i, '')
            .replace(/-(u|a)-\d+$/i, '')
            .trim();
    }

    function isDoubaoTrivialSkillPrompt(text) {
        const t = normalizeDoubaoTextForMatch(text);
        if (!t) return true;
        if (/^翻译为\s*english$/i.test(t)) return true;
        if (/^translate\s+to\s+english$/i.test(t)) return true;
        if (/^翻译$/i.test(t)) return true;
        return false;
    }

    function parseDoubaoInlinePayloadSafe(contentValue, depth = 0) {
        if (typeof contentValue !== 'string') return '';
        const raw = contentValue.trim();
        if (!raw) return '';
        if (depth > 3) return raw;

        let parsed = null;
        try {
            parsed = JSON.parse(raw);
        } catch (_) {
            parsed = null;
        }
        if (parsed == null) return raw;

        if (typeof parsed === 'string') {
            const nested = parsed.trim();
            if (!nested) return '';
            if (nested === raw) return nested;
            return parseDoubaoInlinePayloadSafe(nested, depth + 1);
        }
        if (typeof parsed !== 'object') return raw;

        if (Array.isArray(parsed)) {
            const out = [];
            const walk = (node) => {
                if (!node) return;
                if (typeof node === 'string') {
                    const t = node.trim();
                    if (t) out.push(t);
                    return;
                }
                if (Array.isArray(node)) {
                    node.forEach(walk);
                    return;
                }
                if (typeof node !== 'object') return;
                const t = typeof node?.content?.text_block?.text === 'string'
                    ? node.content.text_block.text.trim()
                    : (typeof node?.text === 'string' ? node.text.trim() : '');
                if (t) out.push(t);
                Object.values(node).forEach(walk);
            };
            walk(parsed);
            return out.join('\n').trim();
        }

        const lines = [];
        const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
        if (text) lines.push(text);

        if (!text && typeof parsed.content === 'string' && parsed.content.trim()) {
            const contentText = parseDoubaoInlinePayloadSafe(parsed.content, depth + 1);
            if (contentText) lines.push(contentText);
        }

        const entities = Array.isArray(parsed.entities) ? parsed.entities : [];
        const fileNames = [];
        entities.forEach((entity, idx) => {
            if (!entity || typeof entity !== 'object') return;
            const file = entity?.entity_content?.file || entity?.file || null;
            const fileName = typeof file?.file_name === 'string'
                ? file.file_name.trim()
                : (typeof file?.name === 'string' ? file.name.trim() : '');
            if (fileName) {
                fileNames.push(fileName);
                return;
            }
            const image = entity?.entity_content?.image || {};
            const url = image?.image_ori?.url || image?.preview_img?.url || image?.image_thumb?.url || '';
            const key = typeof image?.key === 'string' ? image.key.trim() : '';
            const serial = entities.length > 1 ? String(idx + 1) : '';
            if (url) lines.push(`[图片${serial}] ${url}`);
            else if (key) lines.push(`[图片${serial}] ${key}`);
        });

        fileNames.forEach((name, idx) => {
            const serial = fileNames.length > 1 ? String(idx + 1) : '';
            lines.push(`[附件${serial}] ${name}`);
        });

        return lines.length ? lines.join('\n') : '';
    }

    function sanitizeDoubaoUserNodeText(text) {
        const out = [];
        const seen = new Set();
        const pushLine = (line) => {
            const normalized = normalizeDoubaoTextForMatch(line);
            if (!normalized) return;
            if (isDoubaoTrivialSkillPrompt(normalized)) return;
            if (seen.has(normalized)) return;
            seen.add(normalized);
            out.push(normalized);
        };

        String(text || '')
            .split(/\r?\n/)
            .forEach((line) => {
                const rawLine = String(line || '').trim();
                if (!rawLine) return;
                const parsed = parseDoubaoInlinePayloadSafe(rawLine);
                const expanded = (parsed && parsed !== rawLine) ? parsed : rawLine;
                String(expanded)
                    .split(/\r?\n/)
                    .forEach((x) => pushLine(x));
            });

        // 附件去重：若已存在 "[附件] 文件名"，则移除同名的裸文件名行。
        const attachmentNames = new Set();
        out.forEach((line) => {
            const m = String(line).match(/^\[附件\d*\]\s*(.+)$/);
            if (m && m[1]) {
                attachmentNames.add(normalizeDoubaoTextForMatch(m[1]));
            }
        });

        const compact = out.filter((line) => {
            const normalized = normalizeDoubaoTextForMatch(line);
            if (!normalized) return false;
            if (/^\[附件\d*\]\s*/.test(line)) return true;
            return !attachmentNames.has(normalized);
        });

        return compact.join('\n').trim();
    }

    function getDoubaoConversationRows() {
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

    function getDoubaoMessageBubble(row) {
        if (!row) return null;
        return row.querySelector('[data-testid="message_content"]') || row;
    }

    function getDoubaoUserTextFromRow(row) {
        if (!row) return '';
        const refText = sanitizeDoubaoUserNodeText(row.querySelector('[data-testid="ref-content"]')?.innerText || '');
        const fullText = sanitizeDoubaoUserNodeText(row.querySelector('[data-testid="message_content"]')?.innerText || '');
        const plainText = sanitizeDoubaoUserNodeText(row.querySelector('[data-testid="message_text_content"]')?.innerText || '');
        return refText || fullText || plainText || '';
    }

    function getDoubaoRowType(row) {
        const testId = String(row?.getAttribute?.('data-testid') || '').toLowerCase();
        if (testId === 'send_message') return 'user';
        if (testId === 'receive_message') return 'assistant';
        return 'unknown';
    }

    function getDoubaoRowId(row) {
        const byMessageContent = String(row?.querySelector?.('[data-testid="message_content"]')?.getAttribute?.('data-message-id') || '').trim();
        if (byMessageContent) return byMessageContent;
        return String(row?.getAttribute?.('data-id') || '').trim();
    }

    function getDoubaoRowText(row) {
        return getDoubaoRowType(row) === 'user'
            ? getDoubaoUserTextFromRow(row)
            : normalizeDoubaoTextForMatch((row?.querySelector?.('[data-testid="message_text_content"]') || row)?.innerText || '');
    }

    function getDoubaoUserDomCandidates() {
        const rows = getDoubaoConversationRows();
        const out = [];
        const seen = new Set();

        rows.forEach((row, index) => {
            if (getDoubaoRowType(row) !== 'user') return;
            const element = getDoubaoMessageBubble(row);
            const text = getDoubaoRowText(row);
            if (!text) return;
            const id = getDoubaoRowId(row) || `doubao-user-${index + 1}`;
            const key = `${id}::${text.slice(0, 80)}`;
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ id, element, text });
        });

        return out;
    }

    function hasDoubaoApiNodeForDom(sourceMessageId, text) {
        const sid = normalizeDoubaoMessageId(sourceMessageId || '');
        const t = normalizeDoubaoTextForMatch(text || '');
        return doubaoVirtualNodesCache.some((n) => {
            const nid = normalizeDoubaoMessageId(n?.sourceMessageId || n?.id || '');
            const nt = normalizeDoubaoTextForMatch(n?.text || '');
            if (sid && nid && (sid === nid || sid.includes(nid) || nid.includes(sid))) return true;
            if (!t || !nt) return false;
            if (nt === t) return true;
            const p = t.slice(0, Math.min(24, t.length));
            return Boolean(p && nt.includes(p));
        });
    }

    function reconcileDoubaoPendingDomNodesWithApi() {
        if (!Array.isArray(doubaoPendingDomNodes) || !doubaoPendingDomNodes.length) return;
        const next = [];
        const seen = new Set();
        doubaoPendingDomNodes.forEach((n) => {
            if (!n) return;
            const id = String(n.id || '').trim();
            const sid = normalizeDoubaoMessageId(n.sourceMessageId || '');
            const txt = normalizeDoubaoTextForMatch(n.text || '');
            if (hasDoubaoApiNodeForDom(sid, txt)) return;
            const key = `${sid || id}::${txt.slice(0, 64)}`;
            if (seen.has(key)) return;
            seen.add(key);
            next.push(n);
        });
        doubaoPendingDomNodes = next;
    }

    function upsertDoubaoPendingNodeFromDom() {
        const rows = getDoubaoConversationRows();
        let added = 0;
        let questionIndex = -1;
        rows.forEach((row, idx) => {
            if (getDoubaoRowType(row) !== 'user') return;
            questionIndex += 1;
            const text = getDoubaoUserTextFromRow(row);
            if (!text) return;
            const rowId = String(getDoubaoRowId(row) || '').trim();
            const baseId = normalizeDoubaoMessageId(rowId);
            if (hasDoubaoApiNodeForDom(baseId || rowId, text)) return;
            const id = `dom-pending-doubao-${baseId || idx + 1}-${hashStr(text).slice(0, 8)}`;
            if (doubaoPendingDomNodes.some((n) => String(n?.id || '') === id)) return;
            doubaoPendingDomNodes.push({
                id,
                sourceMessageId: baseId || rowId || '',
                role: 'user',
                text: normalizeDoubaoTextForMatch(text),
                sessionIndex: questionIndex >= 0 ? questionIndex : idx,
                element: null,
                pendingDomOnly: true
            });
            added += 1;
        });
        if (added > 0) requestAnimationFrame(() => update());
    }

    function hasDoubaoCompletedAnswerForQuestion(baseId) {
        if (!baseId) return false;
        const rows = getDoubaoConversationRows();
        return rows.some((row) => {
            if (getDoubaoRowType(row) !== 'assistant') return false;
            const rowId = normalizeDoubaoMessageId(getDoubaoRowId(row));
            if (!rowId || rowId !== baseId) return false;
            if (row.querySelector('[aria-busy="true"], [class*="typing"], [class*="loading"], [class*="stream"], [class*="generating"]')) return false;
            const txt = normalizeDoubaoTextForMatch(
                row.querySelector('[data-testid="message_text_content"]')?.innerText
                || row.querySelector('[data-testid="message_content"]')?.innerText
                || row.innerText
            );
            if (!txt) return false;
            if (/^(思考中|生成中|回答中|typing|loading)\b/i.test(txt)) return false;
            return txt.length >= 2;
        });
    }

    async function runDoubaoAutoApiRefreshFromDom() {
        if (!isDoubao || doubaoAutoApiRefreshInFlight) return;
        const now = Date.now();
        if (now - doubaoLastAutoApiRefreshAt < 1200) return;
        const pending = doubaoPendingDomNodes.filter((n) => n && n.pendingDomOnly);
        if (!pending.length) return;
        const ready = pending.some((n) => hasDoubaoCompletedAnswerForQuestion(normalizeDoubaoMessageId(n.sourceMessageId || '')));
        if (!ready) return;

        doubaoAutoApiRefreshInFlight = true;
        doubaoLastAutoApiRefreshAt = now;
        try {
            const list = await getDoubaoMessagesByApi();
            const built = buildDoubaoVirtualNodesFromApi(list);
            if (Array.isArray(built) && built.length) {
                doubaoVirtualNodesCache = built;
                doubaoVirtualNodesLoaded = true;
                doubaoVirtualNodesDirty = false;
            } else {
                scheduleDoubaoVirtualNodesRefresh(true);
            }
            reconcileDoubaoPendingDomNodesWithApi();
            requestAnimationFrame(() => update());
        } catch (e) {
            console.warn('AI-Chat-Helper: 豆包 DOM 驱动自动刷新失败', e);
        } finally {
            doubaoAutoApiRefreshInFlight = false;
        }
    }

    function scheduleDoubaoDomDrivenSync() {
        if (!isDoubao) return;
        if (doubaoDomMutationDebounceTimer) clearTimeout(doubaoDomMutationDebounceTimer);
        doubaoDomMutationDebounceTimer = setTimeout(() => {
            doubaoDomMutationDebounceTimer = null;
            try {
                upsertDoubaoPendingNodeFromDom();
                if (doubaoAutoApiRefreshTimer) clearTimeout(doubaoAutoApiRefreshTimer);
                doubaoAutoApiRefreshTimer = setTimeout(() => {
                    doubaoAutoApiRefreshTimer = null;
                    runDoubaoAutoApiRefreshFromDom();
                }, 900);
            } catch (_) {
                // ignore
            }
        }, 220);
    }

    function isDoubaoElementMatchNode(element, node) {
        if (!element || !node) return false;
        if (!element.isConnected) return false;

        const nodeText = normalizeDoubaoTextForMatch(node.text || '');
        const elText = normalizeDoubaoTextForMatch(element.innerText || '');
        if (!nodeText || !elText) return false;

        if (elText === nodeText) return true;
        const prefix = nodeText.slice(0, Math.min(32, nodeText.length));
        if (prefix && elText.includes(prefix)) return true;
        if (nodeText.length <= 24) return elText === nodeText;
        return false;
    }

    function findDoubaoDomElementByNode(node) {
        if (!node || !node.text) return null;

        const candidates = getDoubaoUserDomCandidates();
        const targetId = String(node.id || '').trim();
        if (targetId) {
            const byId = candidates.find((c) => String(c.id || '').trim() === targetId);
            if (byId?.element) return byId.element;
        }
        const targetText = normalizeDoubaoTextForMatch(node.text);
        const targetPrefix = targetText.slice(0, Math.min(52, targetText.length));
        const targetMiddle = targetText.slice(Math.max(0, Math.floor(targetText.length / 2) - 18), Math.floor(targetText.length / 2) + 18);

        let bestEl = null;
        let bestScore = -1;

        candidates.forEach((c) => {
            const txt = c.text;
            if (!txt) return;

            let score = 0;
            if (targetId && String(c.id || '') === targetId) score += 18;
            if (txt === targetText) score += 14;
            if (targetPrefix && txt.includes(targetPrefix)) score += 8;
            if (targetMiddle && txt.includes(targetMiddle)) score += 4;
            if (targetPrefix && targetText.includes(txt.slice(0, Math.min(24, txt.length)))) score += 3;

            if (score > bestScore) {
                bestScore = score;
                bestEl = c.element;
            }
        });

        return bestScore >= 8 ? bestEl : null;
    }

    function getDoubaoViewportMetrics(scrollEl) {
        const viewportHeight = Math.max(window.innerHeight || 0, document.documentElement?.clientHeight || 0);
        const containerRect = (scrollEl && scrollEl !== window && scrollEl !== document.documentElement)
            ? scrollEl.getBoundingClientRect()
            : null;
        const viewportTop = containerRect ? Math.max(0, containerRect.top) : 0;
        const viewportBottom = containerRect ? Math.min(viewportHeight, containerRect.bottom) : viewportHeight;
        const readingOffset = Math.max(10, Math.min(500, CONFIG.readingLineOffset || 150));
        const readingAnchor = Math.max(
            viewportTop + 10,
            Math.min(viewportBottom - 10, viewportTop + readingOffset)
        );

        return { viewportTop, viewportBottom, readingAnchor };
    }

    function findDoubaoNodeBySignature(id, text) {
        const normalizedId = String(id || '').trim();
        const normalizedText = normalizeDoubaoTextForMatch(text);
        if (normalizedId && nodesMap.has(normalizedId)) {
            const byId = nodesMap.get(normalizedId);
            if (normalizeDoubaoTextForMatch(byId?.text || '') === normalizedText) {
                return byId;
            }
        }

        if (!normalizedText) return null;
        const prefix = normalizedText.slice(0, Math.min(28, normalizedText.length));
        const middle = normalizedText.slice(Math.max(0, Math.floor(normalizedText.length / 2) - 16), Math.floor(normalizedText.length / 2) + 16);
        const scoreNode = (node) => {
            const nodeText = normalizeDoubaoTextForMatch(node?.text || '');
            if (!nodeText) return -1;
            let score = 0;
            if (normalizedId && String(node?.id || '') === normalizedId) score += 18;
            if (nodeText === normalizedText) score += 14;
            if (prefix && nodeText.includes(prefix)) score += 8;
            if (middle && nodeText.includes(middle)) score += 4;
            if (normalizedText.includes(nodeText.slice(0, Math.min(24, nodeText.length)))) score += 3;
            return score;
        };

        // 高频滚动路径优化：优先在当前激活节点附近窗口匹配。
        const activeIdx = activeNodeId ? nodes.findIndex((n) => String(n?.id || '') === String(activeNodeId)) : -1;
        const LOCAL_RADIUS = 140;
        if (activeIdx >= 0) {
            let localBestNode = null;
            let localBestScore = -1;
            const start = Math.max(0, activeIdx - LOCAL_RADIUS);
            const end = Math.min(nodes.length - 1, activeIdx + LOCAL_RADIUS);
            for (let i = start; i <= end; i++) {
                const node = nodes[i];
                const score = scoreNode(node);
                if (score > localBestScore) {
                    localBestScore = score;
                    localBestNode = node;
                }
            }
            if (localBestScore >= 8) return localBestNode;
        }

        // 兜底：窗口未命中再全量扫描，保证准确性。
        let bestNode = null;
        let bestScore = -1;
        for (let i = 0; i < nodes.length; i++) {
            const node = nodes[i];
            const score = scoreNode(node);
            if (score > bestScore) {
                bestScore = score;
                bestNode = node;
            }
        }
        return bestScore >= 8 ? bestNode : null;
    }

    function resolveDoubaoNodeFromRow(row, rows) {
        if (!row) return null;
        const idx = rows.indexOf(row);
        const rowType = getDoubaoRowType(row);

        // 豆包阅读区经常停留在 AI 回复内部，这里回溯到最近一条用户消息。
        if (rowType !== 'user' && idx !== -1) {
            for (let i = idx - 1; i >= 0; i--) {
                if (getDoubaoRowType(rows[i]) === 'user') {
                    return resolveDoubaoNodeFromRow(rows[i], rows);
                }
            }
            // 顶部虚拟列表可能暂时回收了上游用户行，兜底选择后续最近的用户行。
            for (let i = idx + 1; i < rows.length; i++) {
                if (getDoubaoRowType(rows[i]) === 'user') {
                    return resolveDoubaoNodeFromRow(rows[i], rows);
                }
            }
            if (nodes.length === 1) return nodes[0];
        }

        const resolved = findDoubaoNodeBySignature(getDoubaoRowId(row), getDoubaoRowText(row));
        if (resolved) return resolved;
        if (nodes.length === 1) return nodes[0];

        // 兜底：按当前可见用户行的相对顺序映射到节点顺序，避免首次阶段文本匹配失败导致无激活态。
        const userRows = rows.filter((r) => getDoubaoRowType(r) === 'user');
        const userIdx = userRows.indexOf(row);
        if (userRows.length > 1 && userIdx >= 0 && nodes.length > 1) {
            const mapped = Math.round((userIdx / (userRows.length - 1)) * (nodes.length - 1));
            const clamped = Math.max(0, Math.min(nodes.length - 1, mapped));
            return nodes[clamped] || null;
        }

        return null;
    }

    function getDoubaoActiveNodeByConversationState(scrollEl) {
        const rows = getDoubaoConversationRows();
        if (!rows.length) return null;
        if (nodes.length === 1) return nodes[0];

        const { viewportTop, viewportBottom, readingAnchor } = getDoubaoViewportMetrics(scrollEl);

        const visibleRows = rows.filter((row) => {
            const rect = row.getBoundingClientRect();
            return rect.bottom > viewportTop && rect.top < viewportBottom;
        });

        const isNearBottom = Boolean(scrollEl)
            && ((scrollEl.scrollHeight - Math.max(0, Number(scrollEl.scrollTop || 0)) - scrollEl.clientHeight) < 140);
        if (isNearBottom) {
            return nodes[nodes.length - 1] || null;
        }

        const candidateRows = visibleRows.length ? visibleRows : rows;

        let crossingRow = null;
        for (const row of candidateRows) {
            const rect = row.getBoundingClientRect();
            if (rect.top <= readingAnchor && rect.bottom >= readingAnchor) {
                crossingRow = row;
                break;
            }
        }
        if (crossingRow) {
            return resolveDoubaoNodeFromRow(crossingRow, rows);
        }

        let bestRow = null;
        let bestScore = -Infinity;
        candidateRows.forEach((row) => {
            const rect = row.getBoundingClientRect();
            if (!(rect.bottom > viewportTop && rect.top < viewportBottom)) return;

            // 优先选择已经越过阅读线的最近一行，否则退回阅读线下方最近一行。
            const score = rect.top <= readingAnchor
                ? 2000 - Math.abs(readingAnchor - rect.top)
                : 1000 - Math.abs(rect.top - readingAnchor);

            if (score > bestScore) {
                bestScore = score;
                bestRow = row;
            }
        });

        if (!bestRow) return nodes.length === 1 ? nodes[0] : null;
        return resolveDoubaoNodeFromRow(bestRow, rows);
    }

    function getDoubaoReadingAnchorY() {
        const raw = Number(CONFIG?.readingLineOffset || 150);
        return Math.max(24, Math.min(window.innerHeight - 24, Number.isFinite(raw) ? raw : 150));
    }

    function getDoubaoNodeIndexByIdOrText(id, text) {
        const targetId = String(id || '').trim();
        if (targetId) {
            const byId = nodes.findIndex((n) => String(n?.id || '').trim() === targetId);
            if (byId !== -1) return byId;
            const bySourceId = nodes.findIndex((n) => String(n?.sourceMessageId || '').trim() === targetId);
            if (bySourceId !== -1) return bySourceId;
        }

        const targetText = normalizeDoubaoTextForMatch(text || '');
        if (!targetText) return -1;
        const prefix = targetText.slice(0, Math.min(28, targetText.length));
        let bestIdx = -1;
        let bestScore = -1;
        nodes.forEach((n, idx) => {
            const t = normalizeDoubaoTextForMatch(n?.text || '');
            if (!t) return;
            let score = 0;
            if (t === targetText) score += 12;
            if (prefix && (t.includes(prefix) || targetText.includes(t.slice(0, Math.min(24, t.length))))) score += 6;
            if (score > bestScore) {
                bestScore = score;
                bestIdx = idx;
            }
        });
        return bestScore >= 6 ? bestIdx : -1;
    }

    function getDoubaoDomNavList() {
        const rows = getDoubaoConversationRows();
        const out = [];
        rows.forEach((row) => {
            const rowType = getDoubaoRowType(row);
            if (rowType !== 'user') return;
            const rowId = String(getDoubaoRowId(row) || '').trim();
            const text = getDoubaoRowText(row);
            const element = getDoubaoMessageBubble(row) || row;
            const nodeIndex = getDoubaoNodeIndexByIdOrText(rowId, text);
            out.push({
                row,
                rowType,
                rowId,
                text,
                element,
                nodeIndex
            });
        });
        return out;
    }

    function locateDoubaoDomElementByApiNode(apiNode) {
        if (!apiNode) return null;
        const targetId = String(apiNode?.sourceMessageId || apiNode?.id || '').trim();
        if (targetId) {
            const rows = getDoubaoConversationRows();
            for (const row of rows) {
                const rowId = String(getDoubaoRowId(row) || '').trim();
                if (rowId && rowId === targetId) {
                    const bubble = getDoubaoMessageBubble(row) || row;
                    if (bubble && bubble.isConnected) return bubble;
                }
            }
        }
        return findDoubaoDomElementByNode(apiNode);
    }

    function getDoubaoDomBoundsByApiOrder(domList = null) {
        const source = Array.isArray(domList) ? domList : getDoubaoDomNavList();
        const indices = source
            .map((item) => Number(item?.nodeIndex))
            .filter((v) => Number.isInteger(v) && v >= 0);
        if (!indices.length) return { min: -1, max: -1 };
        return { min: Math.min(...indices), max: Math.max(...indices) };
    }

    function getDoubaoDomProgressSignature(scrollEl) {
        const list = getDoubaoDomNavList();
        const firstId = list.length ? String(list[0]?.rowId || '') : '';
        const lastId = list.length ? String(list[list.length - 1]?.rowId || '') : '';
        const top = scrollEl && scrollEl !== window && scrollEl !== document.documentElement
            ? Number(scrollEl.scrollTop || 0)
            : Number(window.scrollY || 0);
        const h = scrollEl && scrollEl !== window && scrollEl !== document.documentElement
            ? Number(scrollEl.scrollHeight || 0)
            : Math.max(Number(document.body?.scrollHeight || 0), Number(document.documentElement?.scrollHeight || 0));
        return `${list.length}|${firstId}|${lastId}|${Math.round(top)}|${h}`;
    }

    function scrollDoubaoBy(scrollEl, delta) {
        if (scrollEl && scrollEl !== window && scrollEl !== document.documentElement && typeof scrollEl.scrollBy === 'function') {
            scrollEl.scrollBy({ top: delta, behavior: 'auto' });
            return;
        }
        window.scrollBy({ top: delta, behavior: 'auto' });
    }

    async function triggerDoubaoOlderHistoryLoad(scrollEl, step, beforeSig = '', token = 0) {
        if (token !== doubaoNavJumpSeq) return false;
        const kick = Math.max(150, Math.round(step * 0.34));
        scrollDoubaoBy(scrollEl, -kick);
        await new Promise((resolve) => setTimeout(resolve, 140));
        if (token !== doubaoNavJumpSeq) return false;
        scrollDoubaoBy(scrollEl, -kick);
        await new Promise((resolve) => setTimeout(resolve, 180));

        const startSig = beforeSig || getDoubaoDomProgressSignature(scrollEl);
        const startedAt = Date.now();
        while (Date.now() - startedAt < 2400) {
            await new Promise((resolve) => setTimeout(resolve, 140));
            if (token !== doubaoNavJumpSeq) return false;
            const nowSig = getDoubaoDomProgressSignature(scrollEl);
            if (nowSig !== startSig) return true;
        }
        return false;
    }

    function computeDoubaoActiveIndexFromViewport() {
        const list = getDoubaoDomNavList();
        if (!list.length) return -1;
        const anchor = getDoubaoReadingAnchorY();
        let bestIndex = -1;
        let bestDist = Infinity;
        list.forEach((item) => {
            const idx = Number(item?.nodeIndex);
            if (!Number.isInteger(idx) || idx < 0) return;
            const el = item?.element;
            if (!el || !el.isConnected || !el.getBoundingClientRect) return;
            const rect = el.getBoundingClientRect();
            if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;
            const center = rect.top + rect.height / 2;
            const dist = Math.abs(center - anchor);
            if (dist < bestDist) {
                bestDist = dist;
                bestIndex = idx;
            }
        });
        return bestIndex;
    }

    function getDoubaoActiveNodeByNavState() {
        const idx = computeDoubaoActiveIndexFromViewport();
        if (idx < 0 || idx >= nodes.length) return null;
        return nodes[idx] || null;
    }

    async function alignDoubaoElementToReadingLine(targetEl, token = 0) {
        const scrollEl = getScrollContainer();
        for (let i = 0; i < 8; i += 1) {
            if (token !== doubaoNavJumpSeq) return false;
            if (!targetEl || !targetEl.isConnected) return false;
            const rect = targetEl.getBoundingClientRect();
            const anchorY = rect.top + Math.min(Math.max(rect.height * 0.35, 16), 80);
            const delta = anchorY - getDoubaoReadingAnchorY();
            if (Math.abs(delta) <= 8) return true;
            scrollDoubaoBy(scrollEl, delta);
            await new Promise((resolve) => setTimeout(resolve, i < 2 ? 180 : 95));
        }
        return true;
    }

    async function findDoubaoTargetWithDirectionalScroll(apiNode, targetApiIndex, token = 0) {
        let target = locateDoubaoDomElementByApiNode(apiNode);
        if (target) return target;

        const scrollEl = getScrollContainer();
        const viewportH = (scrollEl && scrollEl !== window && scrollEl !== document.documentElement ? scrollEl.clientHeight : window.innerHeight) || window.innerHeight;
        const step = Math.max(220, Math.round(viewportH * 0.72));
        const initialBounds = getDoubaoDomBoundsByApiOrder();
        const activeIdx = nodes.findIndex((n) => String(n?.id || '') === String(activeNodeId || ''));
        const fallbackDirection = targetApiIndex >= 0 && activeIdx >= 0 && targetApiIndex < activeIdx ? 'up' : 'down';
        const primaryDirection = initialBounds.min !== -1
            ? (targetApiIndex < initialBounds.min ? 'up' : (targetApiIndex > initialBounds.max ? 'down' : fallbackDirection))
            : fallbackDirection;
        const goingDown = primaryDirection === 'down';

        let staleCount = 0;
        let noProgressRounds = 0;
        let lastSig = getDoubaoDomProgressSignature(scrollEl);
        const startedAt = Date.now();
        const maxDurationMs = 65000;
        let rounds = 0;

        while (Date.now() - startedAt < maxDurationMs) {
            rounds += 1;
            if (token !== doubaoNavJumpSeq) return null;
            scrollDoubaoBy(scrollEl, goingDown ? step : -step);
            await new Promise((resolve) => setTimeout(resolve, 185));
            if (token !== doubaoNavJumpSeq) return null;

            target = locateDoubaoDomElementByApiNode(apiNode);
            if (target) return target;

            const liveIdx = computeDoubaoActiveIndexFromViewport();
            if (liveIdx >= 0 && liveIdx < nodes.length) {
                const activeNode = nodes[liveIdx];
                if (activeNode?.id && activeNode.id !== activeNodeId) {
                    setActiveDot(activeNode.dot, activeNode.id);
                }
            }

            const reachedOrPassed = liveIdx !== -1 && (
                (goingDown && liveIdx >= targetApiIndex) ||
                (!goingDown && liveIdx <= targetApiIndex)
            );

            const bounds = getDoubaoDomBoundsByApiOrder();
            const targetOlderThanDomTop = bounds.min !== -1 && targetApiIndex < bounds.min;
            const targetNewerThanDomBottom = bounds.max !== -1 && targetApiIndex > bounds.max;

            const sigNow = getDoubaoDomProgressSignature(scrollEl);
            staleCount = (sigNow === lastSig) ? (staleCount + 1) : 0;
            lastSig = sigNow;

            if (!goingDown && targetOlderThanDomTop) {
                if (staleCount >= 1) {
                    const changed = await triggerDoubaoOlderHistoryLoad(scrollEl, step, sigNow, token);
                    if (token !== doubaoNavJumpSeq) return null;
                    target = locateDoubaoDomElementByApiNode(apiNode);
                    if (target) return target;
                    if (changed) {
                        staleCount = 0;
                        noProgressRounds = 0;
                    } else {
                        noProgressRounds += 1;
                        await new Promise((resolve) => setTimeout(resolve, 260 + Math.min(1200, noProgressRounds * 140)));
                    }
                }
                continue;
            }

            if (goingDown && targetNewerThanDomBottom) {
                if (rounds % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 90));
                continue;
            }
            if (!reachedOrPassed && staleCount < 3) {
                if (rounds % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 90));
                continue;
            }

            const fineStep = Math.max(70, Math.round(step * 0.28));
            const sign = goingDown ? 1 : -1;
            for (let j = 0; j < 7; j += 1) {
                if (token !== doubaoNavJumpSeq) return null;
                scrollDoubaoBy(scrollEl, sign * fineStep);
                await new Promise((resolve) => setTimeout(resolve, 120));
                if (token !== doubaoNavJumpSeq) return null;
                target = locateDoubaoDomElementByApiNode(apiNode);
                if (target) return target;
            }

            if (!goingDown) {
                const freshBounds = getDoubaoDomBoundsByApiOrder();
                const stillAboveTop = freshBounds.min !== -1 && targetApiIndex < freshBounds.min;
                if (stillAboveTop) continue;
            }
            if (reachedOrPassed && staleCount >= 4) break;
        }
        return null;
    }

    async function jumpToDoubaoNodeById(nodeId) {
        const token = ++doubaoNavJumpSeq;
        const targetIndex = nodes.findIndex((n) => String(n?.id || '') === String(nodeId || ''));
        const targetNode = targetIndex >= 0 ? nodes[targetIndex] : (nodesMap.get(String(nodeId || '')) || null);
        if (!targetNode) return false;

        const targetEl = await findDoubaoTargetWithDirectionalScroll(targetNode, targetIndex, token);
        if (token !== doubaoNavJumpSeq) return false;
        if (!targetEl || !targetEl.isConnected) {
            console.warn(`AI-Chat-Helper: 豆包未定位到目标 DOM 节点 [${targetIndex + 1}] ${targetNode?.sourceMessageId || targetNode?.id || ''}`);
            return false;
        }

        targetNode.element = targetEl;
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise((resolve) => setTimeout(resolve, 220));
        if (token !== doubaoNavJumpSeq) return false;
        await alignDoubaoElementToReadingLine(targetEl, token);
        if (token !== doubaoNavJumpSeq) return false;

        highlightMessage(targetEl);
        scheduleActiveNodeUpdate();
        return true;
    }

    function findQwenDomElementByNode(node) {
        if (!node || !node.text) return null;

        const candidates = getQwenUserDomCandidates();
        const targetId = normalizeQwenMessageId(node.sourceMessageId || node.id);
        if (targetId) {
            const byId = candidates.find((c) => normalizeQwenMessageId(c.id) === targetId);
            if (byId?.element) return byId.element;
            const byContains = candidates.find((c) => {
                const cid = normalizeQwenMessageId(c.id);
                return cid && (cid.includes(targetId) || targetId.includes(cid));
            });
            if (byContains?.element) return byContains.element;
        }
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
            if (msgIdRaw && normalizeQwenMessageId(msgIdRaw) === targetId) score += 16;
            if (txt === targetText) score += 14;
            if (targetPrefix && txt.includes(targetPrefix)) score += 8;
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

        return bestScore >= 8 ? bestEl : null;
    }

    function getQwenReadingAnchorY() {
        const raw = Number(CONFIG?.readingLineOffset || 150);
        return Math.max(24, Math.min(window.innerHeight - 24, Number.isFinite(raw) ? raw : 150));
    }

    function getQwenNodeIndexByIdOrText(id, text) {
        const targetId = normalizeQwenMessageId(id || '');
        if (targetId) {
            const byId = nodes.findIndex((n) => normalizeQwenMessageId(n?.id || '') === targetId);
            if (byId !== -1) return byId;
            const bySourceId = nodes.findIndex((n) => normalizeQwenMessageId(n?.sourceMessageId || '') === targetId);
            if (bySourceId !== -1) return bySourceId;
        }
        const targetText = normalizeQwenTextForMatch(text || '');
        if (!targetText) return -1;
        const prefix = targetText.slice(0, Math.min(28, targetText.length));
        let bestIdx = -1;
        let bestScore = -1;
        nodes.forEach((n, idx) => {
            const t = normalizeQwenTextForMatch(n?.text || '');
            if (!t) return;
            let score = 0;
            if (t === targetText) score += 12;
            if (prefix && (t.includes(prefix) || targetText.includes(t.slice(0, Math.min(24, t.length))))) score += 6;
            if (score > bestScore) {
                bestScore = score;
                bestIdx = idx;
            }
        });
        return bestScore >= 6 ? bestIdx : -1;
    }

    function getQwenDomBoundsByApiOrder() {
        const candidates = getQwenUserDomCandidates();
        if (!candidates.length) return { min: -1, max: -1 };
        const indices = candidates
            .map((c) => getQwenNodeIndexByIdOrText(c?.id || '', c?.text || ''))
            .filter((v) => Number.isInteger(v) && v >= 0);
        if (!indices.length) return { min: -1, max: -1 };
        return { min: Math.min(...indices), max: Math.max(...indices) };
    }

    function getQwenDomProgressSignature(scrollEl) {
        const rows = getQwenConversationRows();
        const firstId = rows.length ? getQwenRowId(rows[0]) : '';
        const lastId = rows.length ? getQwenRowId(rows[rows.length - 1]) : '';
        const top = scrollEl && scrollEl !== window ? Number(scrollEl.scrollTop || 0) : Number(window.scrollY || 0);
        const h = scrollEl && scrollEl !== window
            ? Number(scrollEl.scrollHeight || 0)
            : Math.max(Number(document.body?.scrollHeight || 0), Number(document.documentElement?.scrollHeight || 0));
        return `${rows.length}|${firstId}|${lastId}|${Math.round(top)}|${h}`;
    }

    function scrollQwenBy(scrollEl, delta) {
        if (scrollEl && scrollEl !== window && typeof scrollEl.scrollBy === 'function') {
            scrollEl.scrollBy({ top: delta, behavior: 'auto' });
            return;
        }
        window.scrollBy({ top: delta, behavior: 'auto' });
    }

    async function alignQwenElementToReadingLine(targetEl, token) {
        const scrollEl = getScrollContainer();
        for (let i = 0; i < 8; i += 1) {
            if (token !== qwenNavJumpSeq) return false;
            if (!targetEl || !targetEl.isConnected) return false;
            const rect = targetEl.getBoundingClientRect();
            const anchorY = rect.top + Math.min(Math.max(rect.height * 0.35, 16), 80);
            const delta = anchorY - getQwenReadingAnchorY();
            if (Math.abs(delta) <= 8) return true;
            scrollQwenBy(scrollEl, delta);
            await new Promise((resolve) => setTimeout(resolve, i < 2 ? 180 : 90));
        }
        return true;
    }

    function computeQwenActiveApiIndexFromViewport() {
        const scrollEl = getScrollContainer();
        const activeNode = getQwenActiveNodeByConversationState(scrollEl);
        if (activeNode?.id) {
            const idx = nodes.findIndex((n) => String(n?.id || '') === String(activeNode.id));
            if (idx >= 0) return idx;
        }
        if (activeNodeId) {
            const idx = nodes.findIndex((n) => String(n?.id || '') === String(activeNodeId));
            if (idx >= 0) return idx;
        }
        return -1;
    }

    function inferQwenSearchDirection(targetApiIndex) {
        const liveIdx = computeQwenActiveApiIndexFromViewport();
        if (liveIdx !== -1) return targetApiIndex >= liveIdx ? 'down' : 'up';
        return 'down';
    }

    async function triggerQwenOlderHistoryLoad(scrollEl, step, beforeSig = '', token = 0) {
        if (token !== qwenNavJumpSeq) return false;
        const kick = Math.max(150, Math.round(step * 0.34));
        scrollQwenBy(scrollEl, -kick);
        await new Promise((resolve) => setTimeout(resolve, 140));
        if (token !== qwenNavJumpSeq) return false;
        scrollQwenBy(scrollEl, -kick);
        await new Promise((resolve) => setTimeout(resolve, 180));

        const startSig = beforeSig || getQwenDomProgressSignature(scrollEl);
        const startedAt = Date.now();
        while (Date.now() - startedAt < 2300) {
            await new Promise((resolve) => requestAnimationFrame(() => resolve()));
            await new Promise((resolve) => setTimeout(resolve, 130));
            if (token !== qwenNavJumpSeq) return false;
            const nowSig = getQwenDomProgressSignature(scrollEl);
            if (nowSig !== startSig) return true;
        }
        return false;
    }

    async function findQwenTargetWithDirectionalScroll(targetNode, targetApiIndex, token = 0) {
        let targetEl = findQwenDomElementByNode(targetNode);
        if (targetEl && targetEl.isConnected) return targetEl;

        const scrollEl = getScrollContainer();
        const viewportH = ((scrollEl && scrollEl !== window ? scrollEl.clientHeight : window.innerHeight) || window.innerHeight);
        const step = Math.max(220, Math.round(viewportH * 0.72));
        const initialBounds = getQwenDomBoundsByApiOrder();
        const primaryDirection = initialBounds.min !== -1
            ? (targetApiIndex < initialBounds.min ? 'up' : (targetApiIndex > initialBounds.max ? 'down' : inferQwenSearchDirection(targetApiIndex)))
            : inferQwenSearchDirection(targetApiIndex);
        const goingDown = primaryDirection === 'down';

        let staleCount = 0;
        let noProgressRounds = 0;
        let lastSig = getQwenDomProgressSignature(scrollEl);
        const startedAt = Date.now();
        const maxDurationMs = 600000;
        let rounds = 0;

        while (Date.now() - startedAt < maxDurationMs) {
            rounds += 1;
            if (token !== qwenNavJumpSeq) return null;
            scrollQwenBy(scrollEl, goingDown ? step : -step);
            await new Promise((resolve) => setTimeout(resolve, 180));
            await new Promise((resolve) => requestAnimationFrame(() => resolve()));
            if (token !== qwenNavJumpSeq) return null;

            targetEl = findQwenDomElementByNode(targetNode);
            if (targetEl && targetEl.isConnected) return targetEl;

            const liveIdx = computeQwenActiveApiIndexFromViewport();
            if (liveIdx !== -1 && liveIdx < nodes.length) {
                const liveNode = nodes[liveIdx];
                if (liveNode?.id && liveNode.id !== activeNodeId) {
                    setActiveDot(liveNode.dot, liveNode.id);
                }
            }
            const activeDistance = liveIdx !== -1 ? Math.abs(liveIdx - targetApiIndex) : Number.POSITIVE_INFINITY;
            const reachedOrPassed = liveIdx !== -1 && (
                (goingDown && liveIdx >= targetApiIndex) ||
                (!goingDown && liveIdx <= targetApiIndex)
            );

            const bounds = getQwenDomBoundsByApiOrder();
            const targetOlderThanDomTop = bounds.min !== -1 && targetApiIndex < bounds.min;
            const targetNewerThanDomBottom = bounds.max !== -1 && targetApiIndex > bounds.max;

            const sigNow = getQwenDomProgressSignature(scrollEl);
            staleCount = (sigNow === lastSig) ? (staleCount + 1) : 0;
            lastSig = sigNow;

            if (liveIdx === targetApiIndex) {
                const probeStep = Math.max(48, Math.round(step * 0.16));
                for (let p = 0; p < 8; p += 1) {
                    if (token !== qwenNavJumpSeq) return null;
                    targetEl = findQwenDomElementByNode(targetNode);
                    if (targetEl && targetEl.isConnected) return targetEl;
                    scrollQwenBy(scrollEl, goingDown ? probeStep : -probeStep);
                    await new Promise((resolve) => setTimeout(resolve, 110));
                    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
                }
                if (token !== qwenNavJumpSeq) return null;
                targetEl = findQwenDomElementByNode(targetNode);
                if (targetEl && targetEl.isConnected) return targetEl;
            }

            if (!goingDown && targetOlderThanDomTop) {
                if (staleCount >= 1) {
                    const changed = await triggerQwenOlderHistoryLoad(scrollEl, step, sigNow, token);
                    await new Promise((resolve) => requestAnimationFrame(() => resolve()));
                    if (token !== qwenNavJumpSeq) return null;
                    targetEl = findQwenDomElementByNode(targetNode);
                    if (targetEl && targetEl.isConnected) return targetEl;
                    if (changed) {
                        staleCount = 0;
                        noProgressRounds = 0;
                    } else {
                        noProgressRounds += 1;
                        await new Promise((resolve) => setTimeout(resolve, 260 + Math.min(1400, noProgressRounds * 140)));
                    }
                }
                continue;
            }

            if (goingDown && targetNewerThanDomBottom) {
                if (rounds % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 90));
                continue;
            }
            if (!reachedOrPassed && activeDistance > 2 && staleCount < 3) {
                if (rounds % 8 === 0) await new Promise((resolve) => setTimeout(resolve, 90));
                continue;
            }

            const fineStep = Math.max(70, Math.round(step * 0.28));
            const sign = goingDown ? 1 : -1;
            for (let j = 0; j < 7; j += 1) {
                if (token !== qwenNavJumpSeq) return null;
                scrollQwenBy(scrollEl, sign * fineStep);
                await new Promise((resolve) => setTimeout(resolve, 120));
                await new Promise((resolve) => requestAnimationFrame(() => resolve()));
                if (token !== qwenNavJumpSeq) return null;
                targetEl = findQwenDomElementByNode(targetNode);
                if (targetEl && targetEl.isConnected) return targetEl;
            }

            if (!goingDown) {
                const beforeLoadSig = getQwenDomProgressSignature(scrollEl);
                const changed = await triggerQwenOlderHistoryLoad(scrollEl, Math.max(step, fineStep), beforeLoadSig, token);
                await new Promise((resolve) => requestAnimationFrame(() => resolve()));
                if (token !== qwenNavJumpSeq) return null;
                targetEl = findQwenDomElementByNode(targetNode);
                if (targetEl && targetEl.isConnected) return targetEl;
                if (changed) {
                    staleCount = 0;
                    noProgressRounds = 0;
                    continue;
                }
                noProgressRounds += 1;
                const finalBounds = getQwenDomBoundsByApiOrder();
                if (finalBounds.min !== -1 && targetApiIndex < finalBounds.min) {
                    await new Promise((resolve) => setTimeout(resolve, 260 + Math.min(1400, noProgressRounds * 140)));
                    continue;
                }
            }

            if (!goingDown) {
                const finalBounds = getQwenDomBoundsByApiOrder();
                const stillAboveTop = finalBounds.min !== -1 && targetApiIndex < finalBounds.min;
                if (stillAboveTop) continue;
            }

            if (reachedOrPassed && staleCount >= 4) break;
        }
        return null;
    }

    async function jumpToQwenNodeById(nodeId) {
        const token = ++qwenNavJumpSeq;
        const targetIndex = nodes.findIndex((n) => String(n?.id || '') === String(nodeId || ''));
        const targetNode = targetIndex >= 0 ? nodes[targetIndex] : (nodesMap.get(String(nodeId)) || null);
        if (!targetNode) return false;
        const el = await findQwenTargetWithDirectionalScroll(targetNode, targetIndex, token);
        if (token !== qwenNavJumpSeq) return false;
        if (!el || !el.isConnected) return false;
        targetNode.element = el;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        await new Promise((resolve) => setTimeout(resolve, 220));
        if (token !== qwenNavJumpSeq) return false;
        await alignQwenElementToReadingLine(el, token);
        if (token !== qwenNavJumpSeq) return false;
        highlightMessage(el);
        scheduleActiveNodeUpdate();
        return true;
    }

    function scheduleQwenVirtualNodesRefresh(force = false) {
        if (!isQwen || qwenVirtualNodesLoading) return;

        const refreshStorageKey = storageKey;
        const now = Date.now();
        const retryGap = qwenVirtualNodesCache.length ? 1800 : 700;
        if (!force && (now - qwenVirtualNodesLastFetchAt < retryGap)) return;

        qwenVirtualNodesLoading = true;
        qwenVirtualNodesLastFetchAt = now;
        qwenNodeLog('refresh:start', { force, now, cacheSize: qwenVirtualNodesCache.length });

        getQwenMessagesByApi().then((apiMsgs) => {
            if (refreshStorageKey !== storageKey) return;
            if (!Array.isArray(apiMsgs) || !apiMsgs.length) {
                qwenNodeLog('refresh:empty-api', { apiCount: Array.isArray(apiMsgs) ? apiMsgs.length : -1 });
                qwenVirtualNodesLoaded = true;
                qwenVirtualNodesDirty = false;
                return;
            }

            const changed = applyQwenApiMessagesToCache(apiMsgs, 'polling');
            if (!changed) {
                // 无变更时再走一次通用更新，兼容路由切换后首次刷新等场景。
                requestAnimationFrame(() => {
                    update();
                });
            }
        }).catch((e) => {
            console.warn('AI-Chat-Helper: 千问虚拟节点刷新失败', e);
        }).finally(() => {
            if (refreshStorageKey !== storageKey) return;
            qwenVirtualNodesLoading = false;
            qwenNodeLog('refresh:done', { loading: qwenVirtualNodesLoading, cacheSize: qwenVirtualNodesCache.length });
        });
    }

    function applyQwenApiMessagesToCache(apiMsgs, source = 'unknown', sourceSessionId = '') {
        if (!Array.isArray(apiMsgs) || !apiMsgs.length) return false;
        if (source === 'fetch-hook' || source === 'xhr-hook' || source === 'pending') {
            qwenNodeLog('apply:skip-partial-source', {
                source,
                apiCount: apiMsgs.length
            });
            return false;
        }
        const currentSessionId = getQwenSessionIdFromUrl();
        const normalizedSourceSessionId = String(sourceSessionId || '').trim();
        if (normalizedSourceSessionId && currentSessionId && normalizedSourceSessionId !== currentSessionId) {
            qwenNodeLog('apply:skip-session-mismatch', {
                source,
                sourceSessionId: normalizedSourceSessionId,
                currentSessionId
            });
            return false;
        }

        const userMsgs = apiMsgs.filter((m) => m && m.role === 'user' && m.text);
        if (!userMsgs.length) {
            qwenNodeLog('apply:no-user-messages', {
                source,
                apiCount: apiMsgs.length,
                roleSample: apiMsgs.slice(0, 8).map((m) => String(m?.role || ''))
            });
            return false;
        }

        const built = userMsgs.map((m, idx) => {
            const id = normalizeQwenMessageId(String(m.id || `qwen-user-${idx + 1}`));
            const sourceMessageId = normalizeQwenMessageId(String(m?.sourceMessageId || m?.id || id || ''));
            const text = String(m.text || '').trim();
            return {
                id,
                sourceMessageId,
                role: 'user',
                text,
                sessionIndex: getQwenSessionIndexValue(m.sessionIndex) !== -1 ? getQwenSessionIndexValue(m.sessionIndex) : idx,
                element: null
            };
        }).filter((m) => m.text);

        if (!built.length) {
            qwenNodeLog('apply:built-empty', { source, userCount: userMsgs.length });
            return false;
        }

        qwenVirtualNodesCache = built.slice();
        qwenVirtualNodesSessionId = normalizedSourceSessionId || currentSessionId || '';
        qwenVirtualNodesLoaded = true;
        qwenVirtualNodesDirty = false;
        reconcileQwenPendingDomNodesWithApi();

        const changed = syncQwenNodesFromApi(built);
        qwenNodeLog('apply:cache-updated', {
            source,
            apiCount: apiMsgs.length,
            userCount: userMsgs.length,
            builtCount: built.length,
            changed
        });

        if (changed) {
            const cacheData = nodes.map((n) => ({ id: n.id, text: n.text, role: n.role, sessionIndex: n.sessionIndex }));
            localStorage.setItem(storageKey, JSON.stringify(cacheData));
            render();
            bindConversationScrollListener();
            scheduleActiveNodeUpdate();
        }
        return changed;
    }

        function flushQwenPendingApiPayloads() {
            const currentSessionId = getQwenSessionIdFromUrl();
            const parsed = collectQwenMessagesFromPendingPayloads(currentSessionId);
            if (!Array.isArray(parsed) || !parsed.length) return false;
            return applyQwenApiMessagesToCache(parsed, 'pending-live', currentSessionId);
        }

    function scrollDotIntoView(indexOrDot) {
        let index = -1;
        if (typeof indexOrDot === 'number') {
            index = indexOrDot;
        } else {
            index = nodes.findIndex(n => n.dot === indexOrDot);
        }
        if (index < 0) return;
        centerNodeInOrbital(index);
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
        if (host.includes('deepseek.com')) {
            const dsCandidates = [
                document.querySelector('.ds-virtual-list-scroll-view'),
                document.querySelector('.ds-virtual-list')
            ].filter(Boolean);
            for (const el of dsCandidates) {
                const oy = getComputedStyle(el).overflowY || '';
                if ((oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 4) {
                    return el;
                }
            }
            return document.scrollingElement || document.documentElement || document.body || window;
        }
        if (host.includes('qianwen.com') || host.includes('aliyun.com')) {
            const row = document.querySelector('[data-msgid$="-question"], [data-msg-id$="-question"], [class*="questionItem"], [class*="message-item"]');
            if (row) {
                const byRow = findNearestScrollableAncestor(row);
                if (byRow) return byRow;
            }
            const qwenCandidates = [
                document.querySelector('[class*="chatContent"]'),
                document.querySelector('[class*="messageList"]'),
                document.querySelector('main')
            ].filter(Boolean);
            for (const base of qwenCandidates) {
                const sc = findNearestScrollableAncestor(base);
                if (sc) return sc;
            }
        }
        if (host.includes('doubao.com')) {
            const doubaoRow = document.querySelector('[data-testid="send_message"], [data-testid="receive_message"]');
            if (doubaoRow) {
                const realScroll = findNearestScrollableAncestor(doubaoRow);
                if (realScroll) return realScroll;
            }
            const chatMain = document.querySelector('[data-testid="chat_content"], [class*="chat-content"], [class*="conversation"], main');
            if (chatMain) {
                const realScroll = findNearestScrollableAncestor(chatMain);
                if (realScroll) return realScroll;
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
        // 备选方案：使用文档滚动根，避免误滚到页面容器外层。
        return document.scrollingElement || document.documentElement || document.body || window;
    }

    function triggerInitialScrollJump() {
        const scrollEl = getScrollContainer();
        if (!scrollEl || nodes.length === 0) return;
        
        // 延迟执行，等待内容渲染更稳定
        setTimeout(() => {
            try {
                const current = scrollEl.scrollTop;
                const max = scrollEl.scrollHeight - scrollEl.clientHeight;
                if (max <= 5) return; 
                
                // 往上微调 30px
                scrollEl.scrollBy({ top: -30, behavior: 'instant' });
                
                setTimeout(() => {
                    // 回弹到底部
                    scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'instant' });
                }, 150);
            } catch (e) {}
        }, 800);
    }
    function applyDotBaseVisual(dot) {
        if (!dot) return;
        dot.style.background = 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)';
        dot.style.filter = 'grayscale(0.2)';
        dot.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.15), inset 0 1px 2px rgba(255, 255, 255, 0.3)';
        dot.style.transform = 'translate(-50%, -50%) scale(1)';
        dot.style.zIndex = '2';
        dot.classList.remove('ai-dot-active-ripple');
    }

    function applyDotActiveVisual(dot, node) {
        if (!dot) return;
        const userColor = 'linear-gradient(135deg, #1E88E5 0%, #1565C0 100%)';
        const aiColor = 'linear-gradient(135deg, #4FC3F7 0%, #03A9F4 100%)';
        const isAI = node && (node.role === 'assistant' || node.role === 'ai');
        dot.style.background = isAI ? aiColor : userColor;
        dot.style.opacity = '1';
        dot.style.filter = 'none';
        dot.style.boxShadow = '0 6px 16px rgba(0, 0, 0, 0.2), 0 0 0 2px #fff';
        dot.style.transform = 'translate(-50%, -50%) scale(1.6)';
        dot.style.zIndex = '10';
        dot.classList.add('ai-dot-active-ripple');
    }

    function setActiveDot(dot, nodeId) {
        if (!nodeId || activeNodeId === nodeId) return;

        const prevActiveId = activeNodeId;
        activeNodeId = nodeId;

        if (prevActiveId) {
            const prevNode = nodesMap.get(String(prevActiveId))
                || nodes.find((n) => String(n?.id || '') === String(prevActiveId));
            const prevDot = prevNode?.dot || null;
            if (prevDot && prevDot.isConnected) {
                applyDotBaseVisual(prevDot);
            }
        }

        if (dot && dot.isConnected) {
            const currentNode = nodesMap.get(String(nodeId))
                || nodes.find((n) => String(n?.id || '') === String(nodeId))
                || null;
            applyDotActiveVisual(dot, currentNode);
        }
        if (jumpToastPendingNodeId && String(jumpToastPendingNodeId) === String(nodeId) && isJumpTargetArrived(nodeId)) {
            scheduleJumpToastHideAfterArrived(nodeId);
        }
    }

    function buildDot(node, topPx) {
        const dot = document.createElement('div');
        dot.dataset.nodeId = String(node?.id || '');
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
        
        // 默认非激活态采用统一的静默色彩（中性灰蓝）
        dot.style.background = 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)';
        dot.style.border = `${CONFIG.dotBorder}px solid #fff`;
        dot.style.boxShadow = '0 2px 6px rgba(0, 0, 0, 0.15), inset 0 1px 2px rgba(255, 255, 255, 0.3)';
        dot.style.opacity = '0.6';
        dot.style.filter = 'grayscale(0.2)';
        
        // 应用统一状态样式
        dot.className = 'ai-nav-dot';
        return dot;
    }


    /**
     * 启动独立计时器循环搜寻目标节点
     * 按目标方向持续平滑滚动，等待 DOM 懒加载
     * 命中目标节点后立即停止并执行精确跳转
     */
    function startNodeSearch(targetId) {
        if (isQwen) {
            jumpToQwenNodeById(targetId).catch((e) => {
                console.warn('AI-Chat-Helper: 千问深度跳转异常', e);
            });
            return;
        }
        if (isDoubao) {
            jumpToDoubaoNodeById(targetId).catch((e) => {
                console.warn('AI-Chat-Helper: 豆包深度跳转异常', e);
            });
            return;
        }
        if (isDeepSeek) {
            jumpToDeepSeekNodeById(targetId).catch((e) => {
                console.warn('AI-Chat-Helper: DeepSeek 深度跳转异常', e);
            });
            return;
        }

        // 先清理可能存在的旧计时器
        if (searchIntervalId) {
            clearInterval(searchIntervalId);
            searchIntervalId = null;
        }

        isNodeSearching = true;

        let attempts = 0;
        const targetIdx = nodes.findIndex(n => n.id === targetId);
        const activeIdx = nodes.findIndex(n => n.id === activeNodeId);
        const searchDirection = (targetIdx !== -1 && activeIdx !== -1 && targetIdx > activeIdx) ? 'down' : 'up';
        const TICK_MS = isQwen ? 110 : 160;
        const MAX_ATTEMPTS = 260;
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
            console.log('AI-Chat-Helper: 用户手动交互，中止自动搜寻。');
            stopSearch();
            hideJumpToast();
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
            // 检查是否已经找到节点
            const found = targetNode
                && targetNode.element
                && document.body.contains(targetNode.element)
                && ((!isQwen)
                    || (isQwen && isQwenElementMatchNode(targetNode.element, targetNode) && isDirectionMatched(targetNode.element))
                );

            if (found) {
                stopSearch();
                console.log(` AI-Chat-Helper: ✓ 找到节点 ${targetId}，正在跳转...`);
                jumpToMessage(targetNode.element, targetId);
                if (targetNode.dot && !isQwen) {
                    setActiveDot(targetNode.dot, targetId);
                    scrollDotIntoView(targetNode.dot);
                } else if (isQwen) {
                    setTimeout(() => {
                        scheduleActiveNodeUpdate();
                    }, 420);
                }
                return;
            }

            attempts++;
            if (attempts > MAX_ATTEMPTS) {
                stopSearch();
                console.warn(` AI-Chat-Helper: ✗ 搜寻超时 (${MAX_ATTEMPTS} 次)，未找到节点 ${targetId}`);
                hideJumpToast();
                return;
            }

            if (attempts === 1 || attempts % 6 === 0) {
                console.log(` AI-Chat-Helper: 搜寻中 (${attempts}/${MAX_ATTEMPTS}, dir=${searchDirection})...`);
            }

            // 重新探测滚动容器（容器可能在 SPA 路由后变化）
            const scrollEl = getScrollContainer();
            if (scrollEl && scrollEl !== window && typeof scrollEl.scrollTo === 'function') {
                const ratio = isQwen ? 0.42 : 0.55;
                const baseStep = Math.floor((scrollEl.clientHeight || 700) * ratio);
                const step = Math.min(460, Math.max(160, baseStep));
                const delta = searchDirection === 'down' ? step : -step;
                // 搜寻阶段强调“连续快速推进”，使用 auto 避免 smooth 缓动叠加导致拖尾。
                scrollEl.scrollBy({
                    top: delta,
                    behavior: 'auto'
                });
            } else {
                const viewportH = window.innerHeight || 800;
                const ratio = isQwen ? 0.42 : 0.55;
                const baseStep = Math.floor(viewportH * ratio);
                const step = Math.min(460, Math.max(160, baseStep));
                const delta = searchDirection === 'down' ? step : -step;
                window.scrollBy({
                    top: delta,
                    behavior: 'auto'
                });
            }

            // 自动搜寻期间强制同步一次激活节点，提升过程反馈
            if (attempts % 4 === 0) {
                requestAnimationFrame(() => {
                    scheduleActiveNodeUpdate();
                });
            }
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
                    requestAnimationFrame(() => scheduleActiveNodeUpdate());
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
                    requestAnimationFrame(() => scheduleActiveNodeUpdate());
                    qwenInitUnlockInProgress = false;
                }, 180);
            }
        } catch (e) {
            qwenInitUnlockInProgress = false;
            console.warn('AI-Chat-Helper: 千问初始滚动解锁失败', e);
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
                console.log('AI-Chat-Helper: 历史已加载过，直接开启导出。');
                resolve();
                return;
            }

            const scrollEl = getScrollContainer();
            if (!scrollEl || scrollEl === window) {
                console.warn('AI-Chat-Helper: 未能找到滚动容器，无法自动加载历史。');
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
            const toastThemeBlueRgb = { r: 37, g: 99, b: 235 };
            toast.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%) translateY(-10px);opacity:0;background:rgba(255,255,255,0.5);color:rgba(0,0,0,0.92);font-size:13px;padding:14px 24px;border-radius:20px;border:none;z-index:20000;display:flex;align-items:center;gap:12px;backdrop-filter:blur(14px) saturate(1.12);-webkit-backdrop-filter:blur(14px) saturate(1.12);box-shadow:0 14px 38px rgba(15,23,42,0.12);transition:opacity .28s ease, transform .28s ease;`;
            toast.innerHTML = `<div style="width:18px;height:18px;flex:none;border-radius:999px;background:conic-gradient(from 0deg,${rgbToRgbaText(toastThemeBlueRgb, .2)} 0deg,${rgbToRgbaText(toastThemeBlueRgb, .95)} 320deg,${rgbToRgbaText(toastThemeBlueRgb, .2)} 360deg);mask:radial-gradient(farthest-side,transparent calc(100% - 2px),#000 calc(100% - 1px));-webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 2px),#000 calc(100% - 1px));animation:ai-nodes-spin .9s linear infinite;"></div><div style="min-width:340px;"><div id="load-all-toast-msg" style="color:rgba(0,0,0,0.9);">准备导出：正在回溯历史记录...</div><div style="margin-top:8px;height:6px;background:${rgbToRgbaText(toastThemeBlueRgb, 0.14)};border-radius:99px;overflow:hidden;"><div id="load-all-toast-bar" style="height:100%;width:0%;background:${rgbToRgbaText(toastThemeBlueRgb, .86)};transition:width .25s ease;"></div></div><div id="load-all-toast-sub" style="margin-top:6px;font-size:12px;color:rgba(0,0,0,0.85);">轮次: 0 / ${MAX_TICKS} · 已识别消息: 0 · 到顶确认: 0/${STABLE_ZERO_TARGET}</div></div>`;
            document.body.appendChild(toast);
            requestAnimationFrame(() => {
                if (!toast.isConnected) return;
                toast.style.opacity = '1';
                toast.style.transform = 'translateX(-50%) translateY(0)';
            });

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
                    toastMsg.style.color = 'rgba(0,0,0,0.9)';
                    toastMsg.textContent = '对话数据准备就绪';
                }
                if (toastBar) {
                    toastBar.style.width = '100%';
                    toastBar.style.background = `linear-gradient(90deg,${rgbToRgbaText(toastThemeBlueRgb, 0.94)},${rgbToRgbaText(mixRgb(toastThemeBlueRgb, { r: 255, g: 255, b: 255 }, 0.28), 0.97)})`;
                }
                if (toastSub) {
                    toastSub.style.color = 'rgba(0,0,0,0.85)';
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
                        console.error('AI-Chat-Helper: update error', e);
                    } finally {
                        if (triggerBtn) {
                            triggerBtn.disabled = false;
                            triggerBtn.style.opacity = '1';
                            triggerBtn.style.cursor = 'pointer';
                            triggerBtn.textContent = originalBtnText || '加载全部历史';
                        }
                        toast.style.opacity = '0';
                        toast.style.transform = 'translateX(-50%) translateY(-10px)';
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
        if (!ensureNavigatorMounted()) return;
        if (isQwen) {
            qwenNodeLog('render:start', {
                nodes: nodes.length,
                cache: qwenVirtualNodesCache.length,
                connected: container.isConnected,
                width: container.offsetWidth,
                height: container.offsetHeight
            });
        }
        if (globalTooltip) globalTooltip.style.opacity = '0';

        if (!nodes.length) {
            if (typeof dotsLayer.replaceChildren === 'function') dotsLayer.replaceChildren();
            else dotsLayer.innerHTML = '';
            track.style.display = 'none';
            track.style.top = '0';
            track.style.height = '0';
            content.style.height = '0';
            dotsLayer.style.height = '0';
            scrollArea.style.height = '0';
            return;
        }

        const dotEdgePad = 14;
        const visibleLimit = CONFIG.maxVisibleDotsBeforeScroll;
        const displayCount = Math.min(nodes.length, visibleLimit);
        const visibleHeight = (displayCount - 1) * CONFIG.dotGap + CONFIG.dotSize + dotEdgePad * 2;
        
        const minH = 100;
        const maxVisibleHeight = Math.floor(window.innerHeight * CONFIG.maxTrackViewportRatio);
        const availableHeight = Math.max(minH, window.innerHeight - container.getBoundingClientRect().top - CONFIG.bottomGap - 12);
        const finalVisibleHeight = Math.max(minH, Math.min(visibleHeight, maxVisibleHeight, availableHeight));

        scrollArea.style.height = finalVisibleHeight + 'px';
        content.style.height = finalVisibleHeight + 'px';
        dotsLayer.style.height = finalVisibleHeight + 'px';

        // 核心改动：如果是少节点模式（节点总长度小于可见区域），则垂直居中分布；否则采用滚动模式
        const totalDotsHeight = (nodes.length - 1) * CONFIG.dotGap;
        const isCenteringMode = totalDotsHeight < (finalVisibleHeight - dotEdgePad * 2 - CONFIG.dotSize);
        
        let startY;
        let runningOffset = orbitalScrollOffset;

        if (isCenteringMode) {
            // 居中模式：让点位集合在 finalVisibleHeight 内垂直居中
            startY = (finalVisibleHeight - totalDotsHeight) / 2;
            runningOffset = 0; // 该模式下不考虑滚动偏移
        } else {
            // 滚动模式：从顶部 Padding 开始，节点随滚动偏移移动
            startY = dotEdgePad + CONFIG.dotSize / 2;
            
            const bounds = getOrbitalScrollBounds(nodes.length);
            orbitalTargetScrollOffset = Math.max(bounds.min, Math.min(bounds.max, orbitalTargetScrollOffset));
            orbitalScrollOffset = Math.max(bounds.min, Math.min(bounds.max, orbitalScrollOffset));
            runningOffset = orbitalScrollOffset;
        }

        // 轨道样式：轨道可随节点跨度缩短，但始终保留最小可见长度。
        const minTrackHeight = Math.max(28, Math.round(CONFIG.dotSize * 2.4));
        const singleNodeMinTrackHeight = Math.max(56, Math.round(CONFIG.dotSize * 4.8));
        const fullTrackHeight = Math.max(minTrackHeight, finalVisibleHeight - dotEdgePad * 2);
        const visibleNodeSpan = Math.max(0, (Math.min(nodes.length, visibleLimit) - 1) * CONFIG.dotGap);
        const desiredTrackHeight = visibleNodeSpan + CONFIG.dotSize + 12;
        const trackHeight = nodes.length === 1
            ? Math.min(fullTrackHeight, singleNodeMinTrackHeight)
            : Math.max(minTrackHeight, Math.min(fullTrackHeight, Math.round(desiredTrackHeight)));
        const trackTop = Math.round((finalVisibleHeight - trackHeight) / 2);
        const trackBottom = trackTop + trackHeight;
        track.style.display = 'block';
        track.style.top = trackTop + 'px';
        track.style.height = trackHeight + 'px';
        track.style.width = '4px';
        track.style.background = 'linear-gradient(180deg, rgba(200,200,200,0.15) 0%, rgba(200,200,200,0.3) 50%, rgba(200,200,200,0.15) 100%)';

        const fragment = document.createDocumentFragment();
        const baseY = dotEdgePad + CONFIG.dotSize / 2;

        let startIdx = 0;
        let endIdx = nodes.length - 1;
        if (!isCenteringMode) {
            // 大会话性能优化：只渲染可见窗口内的点，避免全量遍历。
            const minRel = (-15 - baseY) / CONFIG.dotGap;
            const maxRel = (finalVisibleHeight + 15 - baseY) / CONFIG.dotGap;
            startIdx = Math.max(0, Math.floor(runningOffset + minRel) - 1);
            endIdx = Math.min(nodes.length - 1, Math.ceil(runningOffset + maxRel) + 1);
        }

        for (let index = startIdx; index <= endIdx; index++) {
            const node = nodes[index];
            const relOffset = index - runningOffset;
            const topPx = isCenteringMode
                ? (startY + index * CONFIG.dotGap)
                : (baseY + relOffset * CONFIG.dotGap);

            if (topPx < -15 || topPx > finalVisibleHeight + 15) continue;

            const dot = buildDot(node, topPx);
            node.dot = dot;

            const isActive = node.id === activeNodeId;
            if (isActive) applyDotActiveVisual(dot, node);

            let targetOpacity = isActive ? 1 : (nodes.length === 1 ? 0.9 : 0.6);
            if (!isActive && (topPx < trackTop || topPx > trackBottom)) {
                targetOpacity = 0;
            }

            dot.style.opacity = String(Math.max(0, Math.min(1, targetOpacity)));
            fragment.appendChild(dot);
        }

        if (typeof dotsLayer.replaceChildren === 'function') {
            dotsLayer.replaceChildren(fragment);
        } else {
            dotsLayer.innerHTML = '';
            dotsLayer.appendChild(fragment);
        }
    }

    function update() {
        ensureNavigatorMounted();
        bindConversationScrollListener();
        if (updateStorageKey()) {
            nodes = [];
            nodesMap.clear();
            render();
            init(true);
            if (isQwen) {
                setTimeout(() => maybeRunQwenInitialScrollUnlock(), 1200);
            }
            return;
        }

        const currentBatch = getMessages();

        if (isQwen || isDeepSeek || isDoubao) {
            const virtualCacheLength = isQwen
                ? qwenVirtualNodesCache.length
                : (isDeepSeek ? deepseekVirtualNodesCache.length : doubaoVirtualNodesCache.length);
            const sig = `${currentBatch.length}|${nodes.length}|${nodesMap.size}|${virtualCacheLength}`;
            
            if (sig !== qwenLastUpdateDebugSig) {
                qwenLastUpdateDebugSig = sig;
                if (isQwen) {
                    qwenNodeLog('update:snapshot', {
                        currentBatch: currentBatch.length,
                        nodes: nodes.length,
                        nodesMap: nodesMap.size,
                        virtualCache: qwenVirtualNodesCache.length
                    });
                }
            }

            // 统一使用全量同步逻辑，防止旧缓存或切换对话导致的重复节点
            const changed = isQwen
                ? syncQwenNodesFromApi(currentBatch)
                : (isDeepSeek ? syncDeepSeekNodesFromApi(currentBatch) : syncDoubaoNodesFromApi(currentBatch));
            if (changed) {
                const cacheData = nodes.map(n => ({ id: n.id, text: n.text, role: n.role, sessionIndex: n.sessionIndex }));
                localStorage.setItem(storageKey, JSON.stringify(cacheData));
                render();
                bindConversationScrollListener();
                scheduleActiveNodeUpdate();
            } else if (isDoubao && !activeNodeId) {
                // 豆包初始化阶段即使节点集合未变化，也要尝试建立首个激活态。
                scheduleActiveNodeUpdate();
            }
            return;
        }

        if (currentBatch.length === 0) return;

        // ====================================================
        // 所有平台通用路径 (优化版)
        // ====================================================
        let hasNew = false;

        // 1. 更新现有节点的元素引用
        currentBatch.forEach(msg => {
            if (nodesMap.has(msg.id)) {
                if (msg.element) nodesMap.get(msg.id).element = msg.element;
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
                        if (msg.element && existing.element && document.body.contains(existing.element)) {
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
                    if (msg.element) {
                        const rect = msg.element.getBoundingClientRect();
                        // 如果消息在视口上方较远，大概率是加载的历史消息，插入到首部
                        if (rect.top < 200) insertedIndex = 0;
                        // 否则插入到末尾
                        else insertedIndex = nodes.length;
                    } else {
                        // API 节点暂未绑定到 DOM 时，按批次顺序追加，避免中断更新。
                        insertedIndex = nodes.length;
                    }
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
            const cacheData = nodes.map(n => ({ id: n.id, text: n.text, role: n.role, sessionIndex: n.sessionIndex }));
            localStorage.setItem(storageKey, JSON.stringify(cacheData));
            render();
            bindConversationScrollListener();
            scheduleActiveNodeUpdate();
        }

    }

    function syncDeepSeekNodesFromApi(currentBatch) {
        if (!Array.isArray(currentBatch)) return false;
        if (!currentBatch.length) {
            if (!nodes.length && nodesMap.size === 0) return false;
            nodes = [];
            nodesMap = new Map();
            if (activeNodeId) activeNodeId = null;
            return true;
        }
        
        let hasAnyChange = false;
        if (nodes.length !== currentBatch.length) {
            hasAnyChange = true;
        } else {
            for (let i = 0; i < nodes.length; i++) {
                if (nodes[i]?.id !== currentBatch[i]?.id || nodes[i]?.text !== currentBatch[i]?.text) {
                    hasAnyChange = true;
                    break;
                }
            }
        }

        if (hasAnyChange) {
            nodes = [...currentBatch];
            nodesMap = new Map(nodes.map(n => [String(n.id), n]));
        } else {
            // 更新元素与分组引用以保持激活状态同步
            currentBatch.forEach(msg => {
                const node = nodesMap.get(String(msg.id));
                if (!node) return;
                node.element = msg.element || null;
                node.rowId = String(msg.rowId || '');
                node._dsRow = msg._dsRow || null;
                node._dsAssistantRows = Array.isArray(msg._dsAssistantRows) ? msg._dsAssistantRows : [];
            });
        }
        
        return hasAnyChange;
    }

    function syncDoubaoNodesFromApi(currentBatch) {
        if (!Array.isArray(currentBatch) || !doubaoVirtualNodesLoaded) return false;

        let hasAnyChange = false;
        if (nodes.length !== currentBatch.length) {
            hasAnyChange = true;
        } else {
            for (let i = 0; i < nodes.length; i++) {
                if (nodes[i]?.id !== currentBatch[i]?.id || nodes[i]?.text !== currentBatch[i]?.text) {
                    hasAnyChange = true;
                    break;
                }
            }
        }

        if (hasAnyChange) {
            nodes = [...currentBatch];
            nodesMap = new Map(nodes.map(n => [String(n.id), n]));
            // 豆包首次初始化时，默认展示最新节点区域，避免停在最旧位置。
            if (!activeNodeId && orbitalLastInteractionAt === 0) {
                primeOrbitalToLatest();
            }
        } else {
            // 性能优化：无变化时不对所有节点逐条做 DOM 反查。
            // element 在 jumpToMessage 内部会按需惰性定位。
            currentBatch.forEach((msg) => {
                const node = nodesMap.get(String(msg.id));
                if (!node) return;
                if (msg.element) node.element = msg.element;
            });
        }

        return hasAnyChange;
    }

    function syncQwenNodesFromApi(currentBatch) {
        if (!Array.isArray(currentBatch) || !currentBatch.length) return false;
        const normalizedBatch = currentBatch.slice();
        const qRows = getQwenConversationRows().filter((row) => getQwenRowType(row) === 'question');

        // 节点显示兜底：若 API 文本缺少附件信息，使用 DOM 问题行文本（含附件名）回填。
        normalizedBatch.forEach((msg, idx) => {
            const row = qRows[idx];
            if (!row) return;
            const rowText = getQwenRowText(row);
            const msgText = normalizeQwenTextForMatch(msg?.text || '');
            const rowNormalized = normalizeQwenTextForMatch(rowText || '');
            if (!rowNormalized) return;

            const rowHasAttachment = /\[附件\d*\]/.test(rowText);
            if (!rowHasAttachment) return;

            if (!msgText || !msgText.includes('[附件')) {
                msg.text = rowText;
                return;
            }

            // API 已有附件但内容更短时，以 DOM 版本替换，确保包含问题气泡文本。
            if (rowNormalized.length > msgText.length && rowNormalized.includes(msgText.slice(0, Math.min(24, msgText.length)))) {
                msg.text = rowText;
            }
        });

        const incoming = [];
        const seen = new Set();
        let hasAnyChange = false;

        normalizedBatch.forEach((msg) => {
            const id = String(msg?.id || '').trim();
            const text = String(msg?.text || '').trim();
            if (!id || !text || seen.has(id)) return;

            seen.add(id);

            const prev = nodesMap.get(id) || null;
            const merged = {
                ...(prev || {}),
                ...msg,
                id,
                sourceMessageId: normalizeQwenMessageId(String(msg?.sourceMessageId || prev?.sourceMessageId || id)),
                role: 'user',
                text,
                // 千问轨道数据只依赖 API，element 不参与节点生成/排序
                element: null,
                isLinked: true,
                isHistory: prev ? Boolean(prev.isHistory) : false
            };

            nodesMap.set(id, merged);
            incoming.push(merged);

            if (!prev) {
                hasAnyChange = true;
                return;
            }

            if (String(prev.text || '') !== text || String(prev.role || '') !== 'user' || prev.element !== null) {
                hasAnyChange = true;
            }

            if (getQwenSessionIndexValue(prev.sessionIndex) !== getQwenSessionIndexValue(merged.sessionIndex)) {
                hasAnyChange = true;
            }
        });

        if (!incoming.length) return false;

        const nextNodes = incoming;
        nodesMap = new Map(incoming.map((item) => [String(item.id), item]));

        if (!hasAnyChange) {
            if (nodes.length !== nextNodes.length) {
                hasAnyChange = true;
            } else {
                for (let i = 0; i < nodes.length; i++) {
                    if (nodes[i]?.id !== nextNodes[i]?.id) {
                        hasAnyChange = true;
                        break;
                    }
                }
            }
        }

        nodes = nextNodes;
        return hasAnyChange;
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
                let nodesToLoad = cachedArr;
                if (isQwen) {
                    const sanitized = sanitizeQwenCachedNodes(cachedArr);
                    if (sanitized.legacyFound) {
                        localStorage.removeItem(storageKey);
                        qwenNodeLog('cache:legacy-cleared', {
                            cachedCount: cachedArr.length
                        });
                        nodesToLoad = [];
                    } else {
                        nodesToLoad = sanitized.nodes;
                        if (sanitized.changed) {
                            const normalizedCache = nodesToLoad.map((n) => ({
                                id: n.id,
                                text: n.text,
                                role: n.role,
                                sessionIndex: n.sessionIndex
                            }));
                            localStorage.setItem(storageKey, JSON.stringify(normalizedCache));
                        }
                    }
                }

                nodesToLoad.forEach(m => {
                    m.isHistory = true; 
                    m.isLinked = true; // 缓存的节点默认已链接
                    nodesMap.set(m.id, m);
                });
                nodes = nodesToLoad;
                if (isDoubao && !activeNodeId && orbitalLastInteractionAt === 0) {
                    primeOrbitalToLatest();
                }
                if (nodes.length) {
                    render();
                    bindConversationScrollListener();
                }
            }
        } catch (e) {
            console.error('Failed to load nodes cache', e);
        }
        
        setTimeout(update, 1000);
        if (isQwen) {
            setTimeout(() => scheduleQwenVirtualNodesRefresh(true), 120);
            setTimeout(() => scheduleQwenVirtualNodesRefresh(), 600);
            setTimeout(() => scheduleQwenVirtualNodesRefresh(), 1200);
            setTimeout(() => scheduleQwenDomDrivenSync(), 420);
            setTimeout(() => maybeRunQwenInitialScrollUnlock(), 1200);
        }
        if (isDeepSeek) {
            setTimeout(() => scheduleDeepSeekVirtualNodesRefresh(true), 1200);
        }
        if (isDoubao) {
            const convId = String((String(window.location.pathname || '').match(/\/chat\/([0-9]+)/i) || [])[1] || '').trim();
            if (convId && doubaoInitialFetchConvId !== convId) {
                doubaoInitialFetchConvId = convId;
                // 页面加载后立即主动抓取全量节点，并做补偿重试。
                setTimeout(() => scheduleDoubaoVirtualNodesRefresh(true), 60);
                setTimeout(() => scheduleDoubaoVirtualNodesRefresh(true), 600);
                setTimeout(() => scheduleDoubaoVirtualNodesRefresh(true), 1800);
            } else {
                setTimeout(() => scheduleDoubaoVirtualNodesRefresh(true), 300);
                setTimeout(() => scheduleDoubaoVirtualNodesRefresh(), 1200);
            }
            setTimeout(() => scheduleDoubaoDomDrivenSync(), 420);
            setTimeout(() => kickstartActiveNodeAutoSync(12, 180), 320);
        }
        setTimeout(bindConversationScrollListener, 160);
        
        // 切换完成后触发滚动跳动，用以激活节点
        setTimeout(() => triggerInitialScrollJump(), 1800);
    }

    const observer = new MutationObserver(() => {
        if (isQwen) scheduleQwenDomDrivenSync();
        if (isDoubao) scheduleDoubaoDomDrivenSync();
        if (ticking) return;
        ticking = true;

        requestAnimationFrame(() => {
            update();
            ticking = false;
        });
    });
    let realtimeFallbackTimer = null;
    let realtimeFallbackTicking = false;

    function startRealtimeUpdateFallback() {
        if (realtimeFallbackTimer) return;
        // DOM 监听在部分平台会偶发漏触发，增加低频兜底轮询保证新消息可被及时纳入节点。
        realtimeFallbackTimer = setInterval(() => {
            if (document.hidden) return;
            if (ticking || realtimeFallbackTicking) return;
            realtimeFallbackTicking = true;
            requestAnimationFrame(() => {
                try {
                    update();
                } finally {
                    realtimeFallbackTicking = false;
                }
            });
        }, 1200);
    }
    let composerRealtimeTriggerBound = false;
    let realtimeBurstTimerIds = [];

    function triggerRealtimeRefreshBurst() {
        if (isQwen) {
            scheduleQwenVirtualNodesRefresh(true);
        } else if (isDoubao) {
            scheduleDoubaoVirtualNodesRefresh(true);
        } else if (isDeepSeek) {
            scheduleDeepSeekVirtualNodesRefresh(true);
        }

        requestAnimationFrame(() => update());
        realtimeBurstTimerIds.forEach((id) => clearTimeout(id));
        realtimeBurstTimerIds = [
            setTimeout(() => update(), 360),
            setTimeout(() => update(), 980),
            setTimeout(() => update(), 1850)
        ];
    }

    function bindComposerRealtimeTriggers() {
        if (composerRealtimeTriggerBound) return;
        composerRealtimeTriggerBound = true;

        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            const target = e.target;
            if (!(target instanceof Element)) return;
            const tagName = String(target.tagName || '').toLowerCase();
            const isTextInput = tagName === 'textarea'
                || (tagName === 'input' && (target.getAttribute('type') || 'text').toLowerCase() !== 'checkbox')
                || target.getAttribute('contenteditable') === 'true';
            if (!isTextInput) return;
            if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;
            triggerRealtimeRefreshBurst();
        }, true);

        document.addEventListener('click', (e) => {
            const target = e.target;
            if (!(target instanceof Element)) return;
            const sendButton = target.closest('button,[role="button"]');
            if (!sendButton) return;
            const text = String(sendButton.innerText || sendButton.textContent || '').trim();
            const label = String(sendButton.getAttribute('aria-label') || sendButton.getAttribute('title') || '').trim();
            const dataTestid = String(sendButton.getAttribute('data-testid') || '').trim();
            const haystack = `${text} ${label} ${dataTestid}`.toLowerCase();
            if (!/(发送|send|submit|qwpcicon-send|send_message|chat-send|send-button)/.test(haystack)) return;
            triggerRealtimeRefreshBurst();
        }, true);
    }

    let scrollTicking = false;
    let boundConversationScrollEl = null;
    let activeUpdateRaf = 0;
    let activeUpdateLastAt = 0;
    let activeUpdatePendingOptions = null;

    function handleConversationScrollEvent() {
        if (scrollTicking) return;
        scrollTicking = true;
        requestAnimationFrame(() => {
            scheduleActiveNodeUpdate({ fromPageScroll: true });
            scrollTicking = false;
        });
    }

    function bindConversationScrollListener() {
        const nextScrollEl = getScrollContainer();
        const normalizedNext = (!nextScrollEl || nextScrollEl === document.documentElement) ? window : nextScrollEl;
        if (boundConversationScrollEl === normalizedNext) return;

        if (boundConversationScrollEl && boundConversationScrollEl !== window && boundConversationScrollEl.removeEventListener) {
            boundConversationScrollEl.removeEventListener('scroll', handleConversationScrollEvent, true);
        }

        boundConversationScrollEl = normalizedNext;
        if (boundConversationScrollEl && boundConversationScrollEl !== window && boundConversationScrollEl.addEventListener) {
            boundConversationScrollEl.addEventListener('scroll', handleConversationScrollEvent, { passive: true, capture: true });
        }
    }

    function kickstartActiveNodeAutoSync(retries = 8, delayMs = 220) {
        if (activeNodeId || retries < 0) return;
        scheduleActiveNodeUpdate();
        if (retries === 0) return;
        setTimeout(() => {
            if (!activeNodeId) {
                kickstartActiveNodeAutoSync(retries - 1, delayMs);
            }
        }, delayMs);
    }

    function bootstrapClickLatestDoubaoNodeOnce() {
        if (!isDoubao || !nodes.length) return;
        const convId = String((String(window.location.pathname || '').match(/\/chat\/([0-9]+)/i) || [])[1] || '').trim();
        if (!convId || doubaoBootClickedConvId === convId) return;

        const latestNode = nodes[nodes.length - 1];
        const latestDot = latestNode?.dot || null;
        if (!latestDot || !latestDot.isConnected) return;

        doubaoBootClickedConvId = convId;
        latestDot.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
        }));
    }

    function scheduleActiveNodeUpdate(options = {}) {
        activeUpdatePendingOptions = {
            ...(activeUpdatePendingOptions || {}),
            ...(options || {})
        };

        if (activeUpdateRaf) return;

        activeUpdateRaf = requestAnimationFrame(() => {
            activeUpdateRaf = 0;
            const now = Date.now();
            const minGap = 70;
            if (now - activeUpdateLastAt < minGap) {
                const pending = { ...(activeUpdatePendingOptions || {}) };
                activeUpdatePendingOptions = null;
                setTimeout(() => scheduleActiveNodeUpdate(pending), minGap - (now - activeUpdateLastAt));
                return;
            }
            const pending = activeUpdatePendingOptions || {};
            activeUpdatePendingOptions = null;
            activeUpdateLastAt = Date.now();
            updateActiveNodeOnScroll(pending);
        });
    }

    function updateActiveNodeOnScroll(options = {}) {
        const fromPageScroll = Boolean(options && options.fromPageScroll);
        if (!nodes.length) return;
        const scrollEl = getScrollContainer();
        if (!scrollEl) return;

        if (isQwen || isDeepSeek || isDoubao) {
            const node = isQwen
                ? getQwenActiveNodeByConversationState(scrollEl)
                : (isDeepSeek ? getDeepSeekActiveNodeByConversationState(scrollEl) : getDoubaoActiveNodeByNavState());
            const resolvedNode = node || (nodes.length === 1 ? nodes[0] : null);
            if (resolvedNode && resolvedNode.id !== activeNodeId) {
                setActiveDot(resolvedNode.dot, resolvedNode.id);
                const idx = nodes.indexOf(resolvedNode);
                // 豆包仅在“页面滚动”时居中激活点；API 刷新/重渲染时不挪动轨道。
                const shouldCenterForDoubao = isDoubao && fromPageScroll;
                const shouldCenterForOthers = !isDoubao;
                if ((shouldCenterForDoubao || shouldCenterForOthers) && idx >= 0 && Date.now() - orbitalLastInteractionAt > 420) {
                    centerNodeInOrbital(idx);
                }
            }
            return;
        }

        // 1. 底部吸附判断：如果已经滚到底部，直接激活最后一个节点
        const isAtBottom = (scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight) < 50;
        if (isAtBottom) {
            const lastNode = nodes[nodes.length - 1];
            if (lastNode && lastNode.id !== activeNodeId) {
                setActiveDot(lastNode.dot, lastNode.id);
                if (Date.now() - orbitalLastInteractionAt > 420) centerNodeInOrbital(nodes.length - 1);
            }
            return;
        }

        // 2. 常规位置判定
        let bestNode = null;
        let minDist = Infinity;
        const VIEWPORT_ANCHOR = CONFIG.readingLineOffset; // 视口自定义阅读锚点
        
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
            const idx = nodes.indexOf(bestNode);
            if (Date.now() - orbitalLastInteractionAt > 420) centerNodeInOrbital(idx);
        }
    }

    // ===== 设置按钮与弹出层 =====
    function injectSettings() {
        // 使用全局变量 host, isQwen, isChatGPT, isDoubao, isDeepSeek
        const aiName = isChatGPT ? 'ChatGPT' : (isDeepSeek ? 'DeepSeek' : (isDoubao ? '豆包' : '通义千问'));
        if (!document.getElementById('ai-nodes-inline-style')) {
            const inlineStyle = document.createElement('style');
            inlineStyle.id = 'ai-nodes-inline-style';
            inlineStyle.textContent = '@keyframes ai-nodes-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}';
            document.head.appendChild(inlineStyle);
        }

        if (isQwen) {
            try {
                installQwenCaptureHooks();
            } catch (e) {
                console.warn('AI-Chat-Helper: 千问抓包钩子初始化失败，不影响设置按钮注入', e);
            }
        }

        if (isDoubao) {
            try {
                installDoubaoCaptureHooks();
            } catch (e) {
                console.warn('AI-Chat-Helper: 豆包抓包钩子初始化失败，不影响设置按钮注入', e);
            }
        }

        // 创建按钮
        const btn = document.createElement('button');
        btn.type = 'button';
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
            position: relative;
            pointer-events: auto;
            z-index: 10150;
            background-clip: padding-box;
        `;
        btn.addEventListener('mouseenter', () => {
            btn.style.color = '#555';
            btn.style.transform = 'rotate(30deg)';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.color = '#888';
            btn.style.transform = 'none';
        });
        const buttonHost = document.createElement('div');
        buttonHost.className = 'ai-nodes-settings-host';
        buttonHost.style.cssText = `
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            pointer-events: auto;
            z-index: 10150;
        `;
        buttonHost.appendChild(btn);

        const fallbackHost = document.createElement('div');
        fallbackHost.className = 'ai-nodes-settings-fallback-host';
        fallbackHost.style.cssText = `
            position: fixed;
            top: 16px;
            right: 16px;
            left: auto;
            z-index: 10145;
            display: flex;
            align-items: center;
            justify-content: center;
            pointer-events: auto;
        `;
        const findChatGPTHeaderAnchor = () => (
            document.querySelector('[data-testid="thread-header-right-actions"]') ||
            document.querySelector('#conversation-header-actions') ||
            document.querySelector("#page-header > div.flex.items-center.justify-center.gap-3.overflow-x-hidden > div.flex.items-center.justify-end.overflow-x-hidden") ||
            document.querySelector('#page-header .items-center.justify-end') ||
            document.querySelector('header .items-center.justify-end') ||
            document.querySelector('header [class*="justify-end"]')
        );
        const applyFallbackHostPlacement = () => {
            if (isChatGPT) {
                const anchor = findChatGPTHeaderAnchor();
                if (anchor) {
                    const rect = anchor.getBoundingClientRect();
                    const top = Math.max(8, Math.round(rect.top + Math.max(0, (rect.height - 32) / 2) - 1));
                    const left = Math.round(Math.max(8, Math.min(window.innerWidth - 40, rect.left - 34)));
                    fallbackHost.style.top = `${top}px`;
                    fallbackHost.style.left = `${left}px`;
                    fallbackHost.style.right = 'auto';
                } else {
                    fallbackHost.style.top = '14px';
                    fallbackHost.style.right = '72px';
                    fallbackHost.style.left = 'auto';
                }
            } else {
                fallbackHost.style.top = '16px';
                fallbackHost.style.right = '16px';
                fallbackHost.style.left = 'auto';
            }
        };
        applyFallbackHostPlacement();

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
            z-index: 10160;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.24s cubic-bezier(0.22, 0.61, 0.36, 1), transform 0.24s cubic-bezier(0.22, 0.61, 0.36, 1);
            transform: translateX(10px) scale(0.95);
            backdrop-filter: blur(10px);
        `;
        const platformIconUrl = getPlatformIconUrl();
        popup.innerHTML = `
            <div style="margin-bottom: 12px; border-bottom: 1px solid #eee; padding-bottom: 8px; display:flex; align-items:baseline; gap:6px;">
                <span style="font-weight:700;font-size:15px;letter-spacing:.2px;color:#0f172a;">AI对话助手</span>
                <span style="font-weight:500;font-size:12px;color:#64748b;">设置</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: #666;">
                <img src="${escapeHtml(platformIconUrl)}" alt="${escapeHtml(aiName)}" style="width:16px;height:16px;border-radius:4px;display:block;flex-shrink:0;" referrerpolicy="no-referrer">
                <span>当前 AI 平台: <b>${aiName}</b></span>
            </div>
            
            <div style="margin-top: 12px; padding-top: 8px; border-top: 1px dashed #eee; display: flex; flex-direction: column; gap: 8px;">
                <button id="ai-nodes-node-settings-trigger" style="width:100%; padding:7px 10px; background:#ffffff; border:1px solid #bfdbfe; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1d4ed8; display:flex; align-items:center; justify-content:space-between; gap:6px; transition:all 0.2s;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 7h-9"></path><path d="M14 17H5"></path><circle cx="17" cy="17" r="3"></circle><circle cx="7" cy="7" r="3"></circle></svg>
                    <span style="flex:1; text-align:left;">节点设置</span>
                    <span id="ai-nodes-node-settings-trigger-val">${CONFIG.dotGap} px | ${CONFIG.maxVisibleDotsBeforeScroll}</span>
                </button>
                <button id="ai-nodes-reading-line-trigger" style="margin-top:2px; width:100%; padding:7px 10px; background:#ffffff; border:1px solid #bfdbfe; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700; color:#1d4ed8; display:flex; align-items:center; justify-content:space-between; gap:6px; transition:all 0.2s;">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><polyline points="8 8 12 4 16 8"></polyline><polyline points="16 16 12 20 8 16"></polyline></svg>
                    <span style="flex:1; text-align:left;">调整阅读线</span>
                    <span id="ai-nodes-reading-line-trigger-val">${CONFIG.readingLineOffset} px</span>
                </button>
            </div>
            ${(isQwen || isDoubao) ? `
                <div style="margin-top: 12px; padding-top: 8px; border-top: 1px dashed #eee; display: flex; flex-direction: column; gap: 8px;">
                    <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:12px; cursor:pointer; color:#0f172a; background:rgba(248,250,252,0.75); border:1px solid #e2e8f0; border-radius:8px; padding:7px 10px;">
                        <span style="font-weight:600;">自动收起侧边栏</span>
                        <span class="ai-nodes-switch">
                            <input type="checkbox" id="ai-nodes-opt-collapse" ${autoCollapse ? 'checked' : ''}>
                            <span class="ai-nodes-switch-slider"></span>
                        </span>
                    </label>
                    ${isQwen ? `
                    <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:12px; cursor:pointer; color:#0f172a; background:rgba(248,250,252,0.75); border:1px solid #e2e8f0; border-radius:8px; padding:7px 10px;">
                        <span style="font-weight:600;">移除推荐广告</span>
                        <span class="ai-nodes-switch">
                            <input type="checkbox" id="ai-nodes-opt-ads" ${removeAds ? 'checked' : ''}>
                            <span class="ai-nodes-switch-slider"></span>
                        </span>
                    </label>
                    <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:12px; cursor:pointer; color:#0f172a; background:rgba(248,250,252,0.75); border:1px solid #e2e8f0; border-radius:8px; padding:7px 10px;">
                        <span style="font-weight:600;">输入弹层玻璃背景</span>
                        <span class="ai-nodes-switch">
                            <input type="checkbox" id="ai-nodes-opt-qwen-glass-popups" ${qwenGlassPopups ? 'checked' : ''}>
                            <span class="ai-nodes-switch-slider"></span>
                        </span>
                    </label>
                    ` : ''}
                    ${isDoubao ? `
                    <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:12px; cursor:pointer; color:#0f172a; background:rgba(248,250,252,0.75); border:1px solid #e2e8f0; border-radius:8px; padding:7px 10px;">
                        <span style="font-weight:600;">输入弹层玻璃背景</span>
                        <span class="ai-nodes-switch">
                            <input type="checkbox" id="ai-nodes-opt-doubao-glass-popups" ${doubaoGlassPopups ? 'checked' : ''}>
                            <span class="ai-nodes-switch-slider"></span>
                        </span>
                    </label>
                    ` : ''}
                </div>
            ` : ''}
            ${isDeepSeek ? `
                <div style="margin-top: 12px; padding-top: 8px; border-top: 1px dashed #eee; display: flex; flex-direction: column; gap: 8px;">
                    <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:12px; cursor:pointer; color:#0f172a; background:rgba(248,250,252,0.75); border:1px solid #e2e8f0; border-radius:8px; padding:7px 10px;">
                        <span style="font-weight:600;">隐藏原生节点导航</span>
                        <span class="ai-nodes-switch">
                            <input type="checkbox" id="ai-nodes-opt-hide-deepseek-native-nav" ${hideDeepSeekNativeNav ? 'checked' : ''}>
                            <span class="ai-nodes-switch-slider"></span>
                        </span>
                    </label>
                </div>
            ` : ''}

            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #eee; display: flex; flex-direction: column; gap: 8px;">
                <button id="ai-nodes-clear-refresh" style="width: 100%; border: 1px solid #ff4d4f; background: #fff; color: #ff4d4f; padding: 6px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.2s;">
                    <span style="margin-right: 4px; display:inline-flex; vertical-align:middle;"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6"></path><path d="M3 12a9 9 0 0115-6.7L21 8"></path><path d="M3 22v-6h6"></path><path d="M21 12a9 9 0 01-15 6.7L3 16"></path></svg></span> 重新获取节点
                </button>
                
                <button id="ai-nodes-export-trigger" style="width: 100%; padding: 10px; background: #1E88E5; color: white; border: none; border-radius: 10px; cursor: pointer; font-size: 13px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; transition: all 0.2s; box-shadow: 0 4px 10px rgba(30, 136, 229, 0.2);">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    <span>导出对话记录</span>
                </button>
            </div>
        `;
        document.body.appendChild(popup);
        if (!document.getElementById('ai-nodes-settings-hover-style')) {
            const hoverStyle = document.createElement('style');
            hoverStyle.id = 'ai-nodes-settings-hover-style';
            hoverStyle.textContent = `
                #ai-nodes-node-settings-trigger:hover,
                #ai-nodes-reading-line-trigger:hover {
                    border-color: #3b82f6 !important;
                    box-shadow: 0 0 0 2px rgba(59,130,246,0.16);
                }
                #ai-nodes-clear-refresh:hover {
                    border-color: #ef4444 !important;
                    box-shadow: 0 0 0 2px rgba(239,68,68,0.14);
                }
                .ai-nodes-switch {
                    position: relative;
                    width: 34px;
                    height: 20px;
                    flex-shrink: 0;
                    display: inline-flex;
                    align-items: center;
                }
                .ai-nodes-switch input {
                    position: absolute;
                    inset: 0;
                    opacity: 0;
                    margin: 0;
                    cursor: pointer;
                    z-index: 2;
                }
                .ai-nodes-switch-slider {
                    position: absolute;
                    inset: 0;
                    border-radius: 999px;
                    background: #cbd5e1;
                    transition: background-color .2s ease;
                    box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
                }
                .ai-nodes-switch-slider::before {
                    content: '';
                    position: absolute;
                    width: 16px;
                    height: 16px;
                    left: 2px;
                    top: 2px;
                    border-radius: 50%;
                    background: #fff;
                    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.2);
                    transition: transform .2s ease;
                }
                .ai-nodes-switch input:checked + .ai-nodes-switch-slider {
                    background: #2563eb;
                }
                .ai-nodes-switch input:checked + .ai-nodes-switch-slider::before {
                    transform: translateX(14px);
                }
                .ai-nodes-switch input:focus-visible + .ai-nodes-switch-slider {
                    box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08), 0 0 0 2px rgba(37, 99, 235, 0.22);
                }
                #ai-nodes-export-trigger:hover {
                    box-shadow: inset 0 0 0 1px rgba(191,219,254,0.9), 0 6px 14px rgba(30,136,229,0.28);
                }
            `;
            document.head.appendChild(hoverStyle);
        }

        // 导出二级卡片
        const exportMenu = document.createElement('div');
        // ... (保持 exportMenu 原样，直到其声明结束)
        exportMenu.className = 'ai-nodes-export-menu';
        exportMenu.style.cssText = `
            position: fixed;
            width: auto;
            min-width: 0;
            max-width: calc(100vw - 24px);
            background: rgba(255, 255, 255, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.34);
            border-radius: 12px;
            box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.36);
            padding: 10px;
            z-index: 10161;
            opacity: 0;
            pointer-events: none;
            transform: translateY(-8px) scale(0.96);
            transition: opacity 0.24s cubic-bezier(0.22, 0.61, 0.36, 1), transform 0.24s cubic-bezier(0.22, 0.61, 0.36, 1);
            backdrop-filter: blur(10px) saturate(118%);
            -webkit-backdrop-filter: blur(10px) saturate(118%);
        `;
        exportMenu.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:8px;align-items:center;">
                <button id="ai-nodes-export-current" style="width:152px;padding:8px 10px;background:#1E88E5;color:#fff;border:none;border-radius:9px;cursor:pointer;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:4px;">
                    <svg viewBox="9 7 6 10" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:10px;height:10px;flex:none;"><path d="M10 16L14 12L10 8" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                    <span>导出当前对话</span>
                </button>
                <button id="ai-nodes-export-batch" style="width:152px;padding:8px 10px;background:${(isChatGPT || isDoubao || isQwen || isDeepSeek) ? '#0f766e' : '#f3f4f6'};color:${(isChatGPT || isDoubao || isQwen || isDeepSeek) ? '#fff' : '#6b7280'};border:${(isChatGPT || isDoubao || isQwen || isDeepSeek) ? 'none' : '1px solid #e5e7eb'};border-radius:9px;cursor:pointer;font-size:12px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:4px;">
                    <svg viewBox="9 7 6 10" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:10px;height:10px;flex:none;"><path d="M10 16L14 12L10 8" stroke="${(isChatGPT || isDoubao || isQwen || isDeepSeek) ? '#ffffff' : '#6b7280'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg>
                    <span>批量导出对话</span>
                </button>
            </div>
        `;
        document.body.appendChild(exportMenu);

        // 节点设置二级卡片
        const nodeSettingsMenu = document.createElement('div');
        nodeSettingsMenu.className = 'ai-nodes-node-settings-menu';
        nodeSettingsMenu.style.cssText = `
            position: fixed;
            width: auto;
            min-width: 0;
            max-width: calc(100vw - 24px);
            background: #ffffff;
            border: 1px solid rgba(0, 0, 0, 0.08);
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
            padding: 10px;
            z-index: 10161;
            opacity: 0;
            pointer-events: none;
            transform: translateY(-8px) scale(0.96);
            transition: opacity 0.24s cubic-bezier(0.22, 0.61, 0.36, 1), transform 0.24s cubic-bezier(0.22, 0.61, 0.36, 1);
        `;
        nodeSettingsMenu.innerHTML = `
            <div style="width:186px; padding:8px; display:flex; flex-direction:column; gap:12px;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                    <span style="font-size:12px; color:#0f172a; font-weight:700;">节点间距</span>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <input type="text" inputmode="numeric" id="ai-nodes-dot-gap-val" value="${CONFIG.dotGap}" style="width:46px; text-align:center; border:1px solid #bfdbfe; border-radius:6px; font-size:11px; font-weight:700; padding:3px 2px; color:#0f172a; outline:none; background:rgba(255,255,255,0.75);">
                        <span style="font-size:11px; color:#64748b;">px</span>
                    </div>
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                    <span style="font-size:12px; color:#0f172a; font-weight:700;">单页数量</span>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <input type="text" inputmode="numeric" id="ai-nodes-visible-limit-val" value="${CONFIG.maxVisibleDotsBeforeScroll}" style="width:46px; text-align:center; border:1px solid #bfdbfe; border-radius:6px; font-size:11px; font-weight:700; padding:3px 2px; color:#0f172a; outline:none; background:rgba(255,255,255,0.75);">
                        <span style="font-size:11px; color:#64748b;">个</span>
                    </div>
                </div>
                <div style="font-size:10px; color:#64748b; line-height:1.45;">调整节点纵向间距与单页显示数量。</div>
            </div>
        `;
        document.body.appendChild(nodeSettingsMenu);

        // 阅读线调整二级卡片
        const readingLineMenu = document.createElement('div');
        readingLineMenu.className = 'ai-nodes-reading-line-menu';
        readingLineMenu.style.cssText = `
            position: fixed;
            width: auto;
            min-width: 0;
            max-width: calc(100vw - 24px);
            background: #ffffff;
            border: 1px solid rgba(0, 0, 0, 0.08);
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.12);
            padding: 10px;
            z-index: 10161;
            opacity: 0;
            pointer-events: none;
            transform: translateY(-8px) scale(0.96);
            transition: opacity 0.24s cubic-bezier(0.22, 0.61, 0.36, 1), transform 0.24s cubic-bezier(0.22, 0.61, 0.36, 1);
        `;
        readingLineMenu.innerHTML = `
            <div style="width:186px; padding:8px; display:flex; flex-direction:column; gap:12px;">
                <div style="display:flex; align-items:center; justify-content:space-between;">
                    <span style="font-size:12px; font-weight:700; color:#0f172a;">阅读线高度</span>
                    <span id="ai-nodes-reading-line-display" style="font-size:12px; font-weight:800; color:#1d4ed8; background:rgba(219,234,254,0.85); border:1px solid #bfdbfe; border-radius:999px; padding:2px 8px; line-height:1.3;">${CONFIG.readingLineOffset}px</span>
                </div>
                <input type="range" id="ai-nodes-reading-line-slider" min="10" max="500" value="${CONFIG.readingLineOffset}" style="width:100%; cursor:pointer; accent-color:#2563eb;">
                <div style="font-size:10px; color:#64748b; line-height:1.45;">设置滚动到屏幕何处时激活导航点。</div>
            </div>
        `;
        document.body.appendChild(readingLineMenu);

        // 增加阅读线预览指示器
        const readingLinePreview = document.createElement('div');
        readingLinePreview.id = 'ai-nodes-reading-line-preview';
        readingLinePreview.style.cssText = `
            position: fixed; top: 0; left: 0; right: 0; height: 0;
            background: rgba(255,255,255,0.2);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border-bottom: 2px solid rgba(37,99,235,0.92);
            box-shadow: inset 0 -1px 0 rgba(147,197,253,0.42), 0 0 14px rgba(37,99,235,0.18);
            z-index: 10162; pointer-events: none; opacity: 0;
            transition: opacity 0.2s ease;
        `;
        const rlLabel = document.createElement('div');
        rlLabel.style.cssText = `
            position: absolute; right: 20px; bottom: -20px;
            background: rgba(30,64,175,0.92); color: #fff; font-size: 11px;
            padding: 2px 8px; border-radius: 6px; font-weight: 700;
            border: 1px solid rgba(191,219,254,0.9);
            box-shadow: 0 6px 16px rgba(30,64,175,0.36);
        `;
        rlLabel.innerText = '阅读线基准';
        readingLinePreview.appendChild(rlLabel);
        document.body.appendChild(readingLinePreview);

        const hideExportMenu = () => {
            const openDirection = exportMenu.dataset.openDirection || 'below';
            const hiddenTransform = openDirection === 'above'
                ? 'translateY(8px) scale(0.96)'
                : 'translateY(-8px) scale(0.96)';
            exportMenu.style.opacity = '0';
            exportMenu.style.pointerEvents = 'none';
            exportMenu.style.transform = hiddenTransform;
        };

        const hideReadingLineMenu = () => {
            const openDirection = readingLineMenu.dataset.openDirection || 'left';
            const hiddenTransform = openDirection === 'left'
                ? 'translateX(8px) scale(0.96)'
                : 'translateX(-8px) scale(0.96)';
            readingLineMenu.style.opacity = '0';
            readingLineMenu.style.pointerEvents = 'none';
            readingLineMenu.style.transform = hiddenTransform;
            readingLinePreview.style.opacity = '0';
        };

        const hideNodeSettingsMenu = () => {
            const openDirection = nodeSettingsMenu.dataset.openDirection || 'left';
            const hiddenTransform = openDirection === 'left'
                ? 'translateX(8px) scale(0.96)'
                : 'translateX(-8px) scale(0.96)';
            nodeSettingsMenu.style.opacity = '0';
            nodeSettingsMenu.style.pointerEvents = 'none';
            nodeSettingsMenu.style.transform = hiddenTransform;
        };

        // 绑定事件，防止点击菜单内部导致关闭；点击主设置弹窗区域时收起二级卡片
        popup.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            const target = e.target;
            if (!(target instanceof Element)) return;
            const clickedNodeSettingsTrigger = !!target.closest('#ai-nodes-node-settings-trigger');
            const clickedReadingLineTrigger = !!target.closest('#ai-nodes-reading-line-trigger');
            const clickedExportTrigger = !!target.closest('#ai-nodes-export-trigger');
            if (!clickedNodeSettingsTrigger && !clickedReadingLineTrigger && !clickedExportTrigger) {
                hideExportMenu();
                hideNodeSettingsMenu();
                hideReadingLineMenu();
            }
        });
        exportMenu.addEventListener('click', (e) => e.stopPropagation());
        nodeSettingsMenu.addEventListener('click', (e) => e.stopPropagation());
        readingLineMenu.addEventListener('click', (e) => e.stopPropagation());

        const hideAllSubMenus = () => {
            hideExportMenu();
            hideNodeSettingsMenu();
            hideReadingLineMenu();
        };

        const hidePopup = () => {
            const openDirection = popup.dataset.openDirection || 'left';
            const hiddenTransform = openDirection === 'left'
                ? 'translateX(10px) scale(0.95)'
                : 'translateX(-10px) scale(0.95)';
            popup.style.opacity = '0';
            popup.style.pointerEvents = 'none';
            popup.style.transform = hiddenTransform;
            hideAllSubMenus();
        };
        let lastToggleSettingsAt = 0;

        const placeSideMenuByTrigger = (menuEl, triggerEl, fallbackWidth = 186) => {
            const rect = triggerEl.getBoundingClientRect();
            const margin = 8;
            const sideGap = 10;
            const menuWidth = Math.max(fallbackWidth, Math.round(menuEl.offsetWidth || fallbackWidth));
            const menuHeight = Math.max(80, Math.round(menuEl.offsetHeight || 120));
            const leftSide = rect.left - menuWidth - sideGap;
            const rightSide = rect.right + sideGap;
            const canUseLeft = leftSide >= margin;
            const canUseRight = rightSide + menuWidth <= window.innerWidth - margin;
            const openDirection = canUseLeft ? 'left' : (canUseRight ? 'right' : (rect.left > (window.innerWidth / 2) ? 'left' : 'right'));
            const rawLeft = openDirection === 'left' ? leftSide : rightSide;
            const left = Math.max(margin, Math.min(rawLeft, window.innerWidth - menuWidth - margin));
            const desiredTop = rect.top + ((rect.height - menuHeight) / 2);
            const top = Math.max(margin, Math.min(desiredTop, window.innerHeight - menuHeight - margin));
            const hiddenTransform = openDirection === 'left'
                ? 'translateX(8px) scale(0.96)'
                : 'translateX(-8px) scale(0.96)';
            return {
                left: Math.round(left),
                top: Math.round(top),
                openDirection,
                hiddenTransform
            };
        };

        const openCurrentConversationExport = async () => {
            hidePopup();
            hideExportMenu();
            // GPT、豆包、千问、DeepSeek 导出不走导出前回溯历史
            if (!isChatGPT && !isDoubao && !isQwen && !isDeepSeek) {
                await startLoadAllHistory();
            }
            await openExportModal();
        };

        // 监听自定义参数变化
        const dotGapInput = nodeSettingsMenu.querySelector('#ai-nodes-dot-gap-val');
        const visibleLimitInput = nodeSettingsMenu.querySelector('#ai-nodes-visible-limit-val');
        const nodeSettingsTrigger = popup.querySelector('#ai-nodes-node-settings-trigger');
        const nodeSettingsTriggerVal = popup.querySelector('#ai-nodes-node-settings-trigger-val');

        const updateCustomParams = () => {
            let gap = parseInt(dotGapInput.value);
            let limit = parseInt(visibleLimitInput.value);
            
            if (isNaN(gap) || gap < 20) gap = 20;
            if (gap > 50) gap = 50;
            if (isNaN(limit) || limit < 2) limit = 2;
            if (limit > 30) limit = 30;

            CONFIG.dotGap = gap;
            CONFIG.maxVisibleDotsBeforeScroll = limit;
            setGlobalValue(DOT_GAP_KEY, gap);
            setGlobalValue(VISIBLE_LIMIT_KEY, limit);
            if (nodeSettingsTriggerVal) nodeSettingsTriggerVal.innerText = `${gap} px | ${limit}`;
            
            render();
            const activeNode = nodes.find(n => n.id === activeNodeId);
            if (activeNode) centerNodeInOrbital(nodes.indexOf(activeNode), true);
        };

        dotGapInput.addEventListener('change', updateCustomParams);
        visibleLimitInput.addEventListener('change', updateCustomParams);

        // 阅读线滑动逻辑
        const rlSlider = readingLineMenu.querySelector('#ai-nodes-reading-line-slider');
        const rlDisplay = readingLineMenu.querySelector('#ai-nodes-reading-line-display');
        const rlTrigger = popup.querySelector('#ai-nodes-reading-line-trigger');
        const rlTriggerVal = popup.querySelector('#ai-nodes-reading-line-trigger-val');

        rlSlider.addEventListener('input', (e) => {
            const val = parseInt(e.target.value);
            CONFIG.readingLineOffset = val;
            rlDisplay.innerText = val + 'px';
            readingLinePreview.style.height = val + 'px';
            setGlobalValue(READING_LINE_KEY, val);
            if (rlTriggerVal) rlTriggerVal.innerText = `${val} px`;
            scheduleActiveNodeUpdate();
        });

        if (nodeSettingsTrigger) {
            nodeSettingsTrigger.onclick = (e) => {
                e.stopPropagation();
                hideExportMenu();
                hideReadingLineMenu();
                const visible = nodeSettingsMenu.style.opacity === '1';
                if (visible) {
                    hideNodeSettingsMenu();
                } else {
                    const placement = placeSideMenuByTrigger(nodeSettingsMenu, nodeSettingsTrigger, 186);
                    nodeSettingsMenu.style.top = `${placement.top}px`;
                    nodeSettingsMenu.style.left = `${placement.left}px`;
                    nodeSettingsMenu.dataset.openDirection = placement.openDirection;
                    nodeSettingsMenu.style.transform = placement.hiddenTransform;
                    void nodeSettingsMenu.offsetHeight;
                    nodeSettingsMenu.style.opacity = '1';
                    nodeSettingsMenu.style.pointerEvents = 'auto';
                    nodeSettingsMenu.style.transform = 'translateX(0) scale(1)';
                }
            };
        }

        rlTrigger.onclick = (e) => {
            e.stopPropagation();
            hideExportMenu();
            hideNodeSettingsMenu();
            const visible = readingLineMenu.style.opacity === '1';
            if (visible) {
                hideReadingLineMenu();
            } else {
                const placement = placeSideMenuByTrigger(readingLineMenu, rlTrigger, 186);
                readingLineMenu.style.top = `${placement.top}px`;
                readingLineMenu.style.left = `${placement.left}px`;
                readingLineMenu.dataset.openDirection = placement.openDirection;
                readingLineMenu.style.transform = placement.hiddenTransform;
                void readingLineMenu.offsetHeight;
                readingLineMenu.style.opacity = '1';
                readingLineMenu.style.pointerEvents = 'auto';
                readingLineMenu.style.transform = 'translateX(0) scale(1)';
                
                readingLinePreview.style.height = `${CONFIG.readingLineOffset}px`;
                readingLinePreview.style.opacity = '1';
            }
        };

        // 监听设置项变化


        if (isQwen || isDoubao) {
            popup.querySelector('#ai-nodes-opt-collapse').addEventListener('change', (e) => {
                autoCollapse = e.target.checked;
                setGlobalValue(COLLAPSE_KEY, autoCollapse);
                if (autoCollapse) {
                    applyAutoCollapse();
                    scheduleAutoCollapseRetry();
                }
            });
        }


        if (isQwen) {
            popup.querySelector('#ai-nodes-opt-ads').addEventListener('change', (e) => {
                removeAds = e.target.checked;
                setGlobalValue(ADS_KEY, removeAds);
                if (removeAds) document.body.classList.add('ai-nodes-hide-ads');
                else document.body.classList.remove('ai-nodes-hide-ads');
            });
            const qwenGlassOpt = popup.querySelector('#ai-nodes-opt-qwen-glass-popups');
            if (qwenGlassOpt) {
                qwenGlassOpt.addEventListener('change', (e) => {
                    qwenGlassPopups = e.target.checked;
                    setGlobalValue(QWEN_GLASS_POPUPS_KEY, qwenGlassPopups);
                    document.body.classList.toggle('ai-nodes-qwen-glass-popups', qwenGlassPopups);
                });
            }

            // 加载全部历史节点按鈕
            const loadAllBtn = popup.querySelector('#ai-nodes-load-all');
            if (loadAllBtn) {
                loadAllBtn.onclick = (e) => {
                    e.stopPropagation();
                    // 关闭弹窗
                    hidePopup();
                    startLoadAllHistory(loadAllBtn);
                };
            }
        }

        if (isDoubao) {
            const doubaoGlassOpt = popup.querySelector('#ai-nodes-opt-doubao-glass-popups');
            if (doubaoGlassOpt) {
                doubaoGlassOpt.addEventListener('change', (e) => {
                    doubaoGlassPopups = e.target.checked;
                    setGlobalValue(DOUBAO_GLASS_POPUPS_KEY, doubaoGlassPopups);
                    document.body.classList.toggle('ai-nodes-doubao-glass-popups', doubaoGlassPopups);
                });
            }
        }

        if (isDeepSeek) {
            const hideNavOpt = popup.querySelector('#ai-nodes-opt-hide-deepseek-native-nav');
            if (hideNavOpt) {
                hideNavOpt.addEventListener('change', (e) => {
                    hideDeepSeekNativeNav = e.target.checked;
                    setGlobalValue(DEEPSEEK_NATIVE_NAV_KEY, hideDeepSeekNativeNav);
                    document.body.classList.toggle('ai-nodes-hide-deepseek-native-nav', hideDeepSeekNativeNav);
                });
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
                activeNodeId = null;
                orbitalScrollOffset = 0;
                orbitalTargetScrollOffset = 0;
                stopOrbitalAnimation();
                localStorage.removeItem(storageKey);
                if (isQwen) {
                    qwenVirtualNodesCache = [];
                    qwenPendingApiPayloads = [];
                    qwenVirtualNodesSessionId = '';
                    qwenVirtualNodesLoading = false;
                    qwenVirtualNodesLoaded = false;
                    qwenVirtualNodesLastFetchAt = 0;
                    qwenPendingDomNodes = [];
                    if (qwenDomMutationDebounceTimer) {
                        clearTimeout(qwenDomMutationDebounceTimer);
                        qwenDomMutationDebounceTimer = null;
                    }
                    if (qwenAutoApiRefreshTimer) {
                        clearTimeout(qwenAutoApiRefreshTimer);
                        qwenAutoApiRefreshTimer = null;
                    }
                    qwenAutoApiRefreshInFlight = false;
                    qwenLastAutoApiRefreshAt = 0;
                    qwenVirtualNodesDirty = true;
                    qwenLastUpdateDebugSig = '';
                    qwenHistoryHydrationInFlight = false;
                    qwenLastHydratedSessionId = '';
                    qwenLastHydrationSignature = '';
                    if (qwenEmptyRetryTimer) {
                        clearTimeout(qwenEmptyRetryTimer);
                        qwenEmptyRetryTimer = null;
                    }
                }
                if (isDoubao) {
                    doubaoVirtualNodesCache = [];
                    doubaoVirtualNodesLoading = false;
                    doubaoVirtualNodesLoaded = false;
                    doubaoVirtualNodesLastFetchAt = 0;
                    doubaoVirtualNodesDirty = true;
                    doubaoPendingDomNodes = [];
                    if (doubaoDomMutationDebounceTimer) {
                        clearTimeout(doubaoDomMutationDebounceTimer);
                        doubaoDomMutationDebounceTimer = null;
                    }
                    if (doubaoAutoApiRefreshTimer) {
                        clearTimeout(doubaoAutoApiRefreshTimer);
                        doubaoAutoApiRefreshTimer = null;
                    }
                    doubaoAutoApiRefreshInFlight = false;
                    doubaoLastAutoApiRefreshAt = 0;
                    doubaoLastDomUserSignature = '';
                    doubaoInitialFetchConvId = '';
                    doubaoBootClickedConvId = '';
                }
                // 清掉节点层 DOM（保留容器结构与拖拽手柄）
                if (dotsLayer) dotsLayer.innerHTML = '';
                // 触发重新获取
                update();
                render(); // 核心修复：强制重新渲染圆点
                if (isQwen) {
                    setTimeout(() => scheduleQwenVirtualNodesRefresh(true), 80);
                }
                if (isDoubao) {
                    setTimeout(() => scheduleDoubaoVirtualNodesRefresh(true), 80);
                }
                // 关闭弹窗
                hidePopup();
                hideExportMenu();
            };
        }

        // 绑定导出二级入口
        popup.querySelector('#ai-nodes-export-trigger').onclick = (e) => {
            e.stopPropagation();
            hideNodeSettingsMenu();
            hideReadingLineMenu();
            const visible = exportMenu.style.opacity === '1';
            if (visible) {
                hideExportMenu();
                return;
            }

            const triggerEl = popup.querySelector('#ai-nodes-export-trigger');
            const btnRect = triggerEl.getBoundingClientRect();
            const margin = 12;
            const gap = 8;

            // 先取菜单真实尺寸（隐藏态下仍可通过 offset 获取）
            const menuWidth = Math.max(160, Math.round(exportMenu.offsetWidth || 180));
            const menuHeight = Math.max(80, Math.round(exportMenu.offsetHeight || 104));

            // 水平：优先右对齐触发按钮，不够空间则切到左对齐，再做边界钳制
            const preferRightAlignedLeft = btnRect.right - menuWidth;
            const preferLeftAlignedLeft = btnRect.left;
            const canUseRightAlign = preferRightAlignedLeft >= margin;
            const rawLeft = canUseRightAlign ? preferRightAlignedLeft : preferLeftAlignedLeft;
            const left = Math.max(margin, Math.min(rawLeft, window.innerWidth - menuWidth - margin));

            // 垂直：优先下方，不够空间则切到上方
            const belowTop = btnRect.bottom + gap;
            const aboveTop = btnRect.top - menuHeight - gap;
            const canShowBelow = belowTop + menuHeight <= window.innerHeight - margin;
            const top = canShowBelow
                ? belowTop
                : Math.max(margin, Math.min(aboveTop, window.innerHeight - menuHeight - margin));
            const openDirection = canShowBelow ? 'below' : 'above';
            const hiddenTransform = openDirection === 'above'
                ? 'translateY(8px) scale(0.96)'
                : 'translateY(-8px) scale(0.96)';

            exportMenu.style.left = `${Math.round(left)}px`;
            exportMenu.style.top = `${Math.round(top)}px`;
            exportMenu.dataset.openDirection = openDirection;
            exportMenu.style.transform = hiddenTransform;
            // Force style flush so opening transition follows the chosen direction.
            void exportMenu.offsetHeight;
            exportMenu.style.opacity = '1';
            exportMenu.style.pointerEvents = 'auto';
            exportMenu.style.transform = 'translateY(0) scale(1)';
        };

        const exportCurrentBtn = exportMenu.querySelector('#ai-nodes-export-current');
        if (exportCurrentBtn) {
            exportCurrentBtn.onclick = async (e) => {
                e.stopPropagation();
                await openCurrentConversationExport();
            };
        }

        const exportBatchBtn = exportMenu.querySelector('#ai-nodes-export-batch');
        if (exportBatchBtn) {
            exportBatchBtn.onclick = (e) => {
                e.stopPropagation();
                if (!isChatGPT && !isDoubao && !isQwen && !isDeepSeek) {
                    alert(`${aiName} 暂未实现该功能`);
                    return;
                }
                hidePopup();
                hideExportMenu();
                if (isChatGPT) openChatGPTBatchExportModal();
                else if (isDoubao) openDoubaoBatchExportModal();
                else if (isQwen) openQwenBatchExportModal();
                else if (isDeepSeek) openDeepSeekBatchExportModal();
            };
        }

        function getChatGPTConversationIdFromUrl() {
            const m = window.location.pathname.match(/\/c\/([a-z0-9-]+)/i);
            return m ? m[1] : '';
        }

        async function getChatGPTAccessToken() {
            if (chatgptAccessToken) return chatgptAccessToken;
            try {
                const sessionResp = await fetch('/api/auth/session?unstable_client=true');
                if (!sessionResp.ok) return null;
                const session = await sessionResp.json();
                chatgptAccessToken = session?.accessToken || null;
                return chatgptAccessToken;
            } catch (e) {
                console.warn('AI-Chat-Helper: 获取 ChatGPT access token 失败', e);
                return null;
            }
        }

        function getChatGPTDeviceId() {
            const fromCaptured = Array.from(chatgptCapturedDeviceIds).find(Boolean);
            if (fromCaptured) return String(fromCaptured);

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
            const found = new Set(chatgptCapturedWorkspaceIds);

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

        function normalizeChatGPTBatchTimestamp(raw) {
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

        function buildChatGPTApiHeaders(token, workspaceId = '') {
            const headers = {
                Authorization: `Bearer ${token}`
            };
            const deviceId = getChatGPTDeviceId();
            if (deviceId) headers['oai-device-id'] = deviceId;
            if (workspaceId) headers['ChatGPT-Account-Id'] = workspaceId;
            return headers;
        }

        async function fetchChatGPTProjects(workspaceId, token) {
            if (!workspaceId) return [];
            try {
                const resp = await fetch('/backend-api/gizmos/snorlax/sidebar', {
                    headers: buildChatGPTApiHeaders(token, workspaceId)
                });
                if (!resp.ok) return [];
                const json = await resp.json();
                return (Array.isArray(json?.items) ? json.items : [])
                    .map((item) => ({
                        id: String(item?.gizmo?.id || '').trim(),
                        title: String(item?.gizmo?.display?.name || item?.gizmo?.display_name || '').trim()
                    }))
                    .filter((item) => item.id);
            } catch (e) {
                console.warn('AI-Chat-Helper: 获取 ChatGPT 项目列表失败', workspaceId, e);
                return [];
            }
        }

        function extractChatGPTConversationListItems(rawItems, extra = {}) {
            const items = Array.isArray(rawItems) ? rawItems : [];
            const workspaceId = String(extra.workspaceId || '').trim();
            const workspaceLabel = workspaceId ? '团队空间' : '个人空间';
            const projectId = String(extra.projectId || '').trim();
            const projectTitle = String(extra.projectTitle || '').trim();
            const archived = Boolean(extra.archived);

            return items.map((item, idx) => {
                const id = String(item?.id || item?.conversation_id || item?.conversationId || '').trim();
                if (!id) return null;

                const updated = normalizeChatGPTBatchTimestamp(
                    item?.update_time ?? item?.updated_time ?? item?.updated_at ?? item?.create_time ?? item?.created_at
                );
                const created = normalizeChatGPTBatchTimestamp(
                    item?.create_time ?? item?.created_at ?? item?.inserted_at ?? item?.update_time
                );
                const title = String(item?.title || item?.name || item?.conversation_title || '').trim() || `会话 ${idx + 1}`;
                const badgeCount = Number(item?.message_count ?? item?.badge_count ?? item?.messageCount ?? item?.num_messages);

                return {
                    key: `${workspaceId || 'personal'}::${projectId || 'root'}::${id}`,
                    id,
                    title,
                    workspaceId,
                    workspaceLabel,
                    projectId,
                    projectTitle,
                    archived,
                    updatedAt: updated.value,
                    updatedAtText: updated.text,
                    createdAt: created.value,
                    createdAtText: created.text,
                    badgeCount: Number.isFinite(badgeCount) ? badgeCount : null
                };
            }).filter(Boolean);
        }

        async function fetchChatGPTRootConversations(workspaceId, token, archived, limit, maxPages = 10) {
            const out = [];
            let offset = 0;
            let page = 0;
            let hasMore = true;

            while (hasMore && out.length < limit && page < maxPages) {
                const resp = await fetch(`/backend-api/conversations?offset=${offset}&limit=${CHATGPT_BATCH_PAGE_LIMIT}&order=updated${archived ? '&is_archived=true' : ''}`, {
                    headers: buildChatGPTApiHeaders(token, workspaceId)
                });
                if (!resp.ok) {
                    throw new Error(`获取会话列表失败 (${resp.status})`);
                }

                const json = await resp.json();
                const pageItems = extractChatGPTConversationListItems(json?.items, { workspaceId, archived });
                out.push(...pageItems);

                const rawItems = Array.isArray(json?.items) ? json.items : [];
                hasMore = rawItems.length === CHATGPT_BATCH_PAGE_LIMIT;
                offset += rawItems.length;
                page += 1;
                if (hasMore && out.length < limit) {
                    await new Promise((resolve) => setTimeout(resolve, 180 + Math.floor(Math.random() * 120)));
                }
            }

            return out.slice(0, limit);
        }

        async function fetchChatGPTProjectConversations(workspaceId, token, project, limit) {
            if (!workspaceId || !project?.id || limit <= 0) return [];
            const out = [];
            let cursor = '0';
            let guard = 0;

            while (cursor != null && out.length < limit && guard < 20) {
                const resp = await fetch(`/backend-api/gizmos/${project.id}/conversations?cursor=${encodeURIComponent(cursor)}`, {
                    headers: buildChatGPTApiHeaders(token, workspaceId)
                });
                if (!resp.ok) {
                    throw new Error(`获取项目会话失败 (${resp.status})`);
                }

                const json = await resp.json();
                out.push(...extractChatGPTConversationListItems(json?.items, {
                    workspaceId,
                    projectId: project.id,
                    projectTitle: project.title || ''
                }));

                const nextCursor = json?.cursor;
                if (!nextCursor || nextCursor === cursor) break;
                cursor = String(nextCursor);
                guard += 1;
                if (out.length < limit) {
                    await new Promise((resolve) => setTimeout(resolve, 180 + Math.floor(Math.random() * 120)));
                }
            }

            return out.slice(0, limit);
        }

        async function fetchChatGPTRecentConversations(limit = 100, maxPages = 10) {
            const token = await getChatGPTAccessToken();
            if (!token) throw new Error('未能获取 ChatGPT access token');

            const requested = Math.max(1, Math.min(500, Number(limit) || 100));
            const merged = [];
            const seen = new Set();
            const appendItems = (items) => {
                items.forEach((item) => {
                    if (!item?.id || seen.has(item.key)) return;
                    seen.add(item.key);
                    merged.push(item);
                });
            };

            appendItems(await fetchChatGPTRootConversations('', token, false, requested, maxPages));
            if (merged.length < requested) {
                appendItems(await fetchChatGPTRootConversations('', token, true, requested - merged.length, maxPages));
            }

            const workspaceIds = detectChatGPTWorkspaceIds();
            for (const workspaceId of workspaceIds) {
                if (merged.length >= requested) break;

                try {
                    appendItems(await fetchChatGPTRootConversations(workspaceId, token, false, requested - merged.length, maxPages));
                    if (merged.length < requested) {
                        appendItems(await fetchChatGPTRootConversations(workspaceId, token, true, requested - merged.length, maxPages));
                    }
                } catch (e) {
                    console.warn('AI-Chat-Helper: 获取 ChatGPT 空间会话失败', workspaceId, e);
                }

                if (merged.length >= requested) break;

                try {
                    const projects = await fetchChatGPTProjects(workspaceId, token);
                    for (const project of projects) {
                        if (merged.length >= requested) break;
                        appendItems(await fetchChatGPTProjectConversations(workspaceId, token, project, requested - merged.length));
                    }
                } catch (e) {
                    console.warn('AI-Chat-Helper: 获取 ChatGPT 项目会话失败', workspaceId, e);
                }
            }

            return {
                requested,
                obtained: merged.length,
                conversations: merged.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, requested)
            };
        }

        async function fetchChatGPTConversationById(conversationId, workspaceId = '') {
            const token = await getChatGPTAccessToken();
            if (!token) throw new Error('未能获取 ChatGPT access token');

            const resp = await fetch(`/backend-api/conversation/${conversationId}`, {
                headers: buildChatGPTApiHeaders(token, workspaceId)
            });
            if (!resp.ok) {
                throw new Error(`获取会话详情失败 (${resp.status})`);
            }
            return resp.json();
        }

        async function exportChatGPTBatchConversations(conversations, format) {
            await exportBatchConversationsAsZip('ChatGPT', conversations, format, 'ChatGPT');
        }

        function cleanChatGPTText(text) {
            if (!text) return '';
            return text
                .replace(/\uE200cite(?:\uE202turn\d+(?:search|view)\d+)+\uE201/gi, '')
                .replace(/cite(?:turn\d+(?:search|view)\d+)+/gi, '')
                .replace(/[“"]\s*[“"](?=\s|$)/g, '')
                .replace(/\s{2,}/g, ' ')
                .replace(/\n[ \t]+\n/g, '\n\n')
                .trim();
        }

        function normalizeChatGPTReferenceName(reference) {
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

        function buildChatGPTReferenceReplacement(reference, fallbackLabel) {
            const type = String(reference?.type || reference?.metadata?.type || '').toLowerCase();
            const name = normalizeChatGPTReferenceName(reference);
            if (type === 'file' || name) {
                return `[${fallbackLabel || '文件引用'}: ${name || '未命名文件'}]`;
            }
            return `[${fallbackLabel || '引用'}]`;
        }

        function applyChatGPTMessageReferences(text, msg) {
            let output = String(text || '');
            const refs = Array.isArray(msg?.metadata?.content_references) ? msg.metadata.content_references : [];
            if (refs.length) {
                const exactItems = refs
                    .map((ref, idx) => ({
                        idx,
                        start: Number(ref?.start_idx),
                        end: Number(ref?.end_idx),
                        matchedText: String(ref?.matched_text || ''),
                        replacement: buildChatGPTReferenceReplacement(ref, ref?.type === 'file' ? '文件引用' : '引用')
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
                        replacement: buildChatGPTReferenceReplacement(
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

        function escapeHtml(str) {
            return String(str || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        const ZIP_TEXT_ENCODER = new TextEncoder();
        const ZIP_CRC32_TABLE = (() => {
            const table = new Uint32Array(256);
            for (let i = 0; i < 256; i += 1) {
                let c = i;
                for (let j = 0; j < 8; j += 1) {
                    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
                }
                table[i] = c >>> 0;
            }
            return table;
        })();

        function crc32(bytes) {
            let crc = 0xFFFFFFFF;
            for (let i = 0; i < bytes.length; i += 1) {
                crc = ZIP_CRC32_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
            }
            return (crc ^ 0xFFFFFFFF) >>> 0;
        }

        function getDosDateTime(date = new Date()) {
            const year = Math.max(1980, date.getFullYear());
            const dosTime = ((date.getHours() & 0x1F) << 11)
                | ((date.getMinutes() & 0x3F) << 5)
                | Math.floor(date.getSeconds() / 2);
            const dosDate = (((year - 1980) & 0x7F) << 9)
                | (((date.getMonth() + 1) & 0x0F) << 5)
                | (date.getDate() & 0x1F);
            return { dosTime, dosDate };
        }

        function createZipBlob(entries) {
            const localParts = [];
            const centralParts = [];
            let offset = 0;

            entries.forEach((entry) => {
                const fileNameBytes = ZIP_TEXT_ENCODER.encode(String(entry.name || 'file.txt'));
                const dataBytes = entry.data instanceof Uint8Array
                    ? entry.data
                    : ZIP_TEXT_ENCODER.encode(String(entry.data || ''));
                const fileDate = entry.date instanceof Date ? entry.date : new Date();
                const { dosTime, dosDate } = getDosDateTime(fileDate);
                const checksum = crc32(dataBytes);

                const localHeader = new Uint8Array(30 + fileNameBytes.length);
                const localView = new DataView(localHeader.buffer);
                localView.setUint32(0, 0x04034b50, true);
                localView.setUint16(4, 20, true);
                localView.setUint16(6, 0x0800, true);
                localView.setUint16(8, 0, true);
                localView.setUint16(10, dosTime, true);
                localView.setUint16(12, dosDate, true);
                localView.setUint32(14, checksum, true);
                localView.setUint32(18, dataBytes.length, true);
                localView.setUint32(22, dataBytes.length, true);
                localView.setUint16(26, fileNameBytes.length, true);
                localView.setUint16(28, 0, true);
                localHeader.set(fileNameBytes, 30);

                const centralHeader = new Uint8Array(46 + fileNameBytes.length);
                const centralView = new DataView(centralHeader.buffer);
                centralView.setUint32(0, 0x02014b50, true);
                centralView.setUint16(4, 20, true);
                centralView.setUint16(6, 20, true);
                centralView.setUint16(8, 0x0800, true);
                centralView.setUint16(10, 0, true);
                centralView.setUint16(12, dosTime, true);
                centralView.setUint16(14, dosDate, true);
                centralView.setUint32(16, checksum, true);
                centralView.setUint32(20, dataBytes.length, true);
                centralView.setUint32(24, dataBytes.length, true);
                centralView.setUint16(28, fileNameBytes.length, true);
                centralView.setUint16(30, 0, true);
                centralView.setUint16(32, 0, true);
                centralView.setUint16(34, 0, true);
                centralView.setUint16(36, 0, true);
                centralView.setUint32(38, 0, true);
                centralView.setUint32(42, offset, true);
                centralHeader.set(fileNameBytes, 46);

                localParts.push(localHeader, dataBytes);
                centralParts.push(centralHeader);
                offset += localHeader.length + dataBytes.length;
            });

            const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
            const endRecord = new Uint8Array(22);
            const endView = new DataView(endRecord.buffer);
            endView.setUint32(0, 0x06054b50, true);
            endView.setUint16(4, 0, true);
            endView.setUint16(6, 0, true);
            endView.setUint16(8, entries.length, true);
            endView.setUint16(10, entries.length, true);
            endView.setUint32(12, centralSize, true);
            endView.setUint32(16, offset, true);
            endView.setUint16(20, 0, true);

            return new Blob([...localParts, ...centralParts, endRecord], { type: 'application/zip' });
        }

        function downloadBlob(blob, filename) {
            const a = document.createElement('a');
            const href = URL.createObjectURL(blob);
            a.href = href;
            a.download = filename;
            a.click();
            setTimeout(() => URL.revokeObjectURL(href), 0);
        }

        function sanitizeExportFileName(name, fallback = '会话') {
            const cleaned = String(name || '')
                .replace(/[\\/:*?"<>|]/g, ' ')
                .replace(/[\u0000-\u001F]/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .replace(/[. ]+$/g, '');
            return (cleaned || fallback).slice(0, 80);
        }

        function getUniqueBatchFileName(baseName, extension, usedNames) {
            const safeBase = sanitizeExportFileName(baseName);
            const normalizedExt = String(extension || '').replace(/^\./, '');
            let candidate = `${safeBase}.${normalizedExt}`;
            let index = 2;
            while (usedNames.has(candidate)) {
                candidate = `${safeBase} (${index}).${normalizedExt}`;
                index += 1;
            }
            usedNames.add(candidate);
            return candidate;
        }

        function buildBatchConversationJson(platform, conversation) {
            return JSON.stringify({
                platform,
                exportedAt: new Date().toISOString(),
                conversationId: conversation.conversationId || '',
                title: conversation.title || '',
                updatedAt: conversation.updatedAtText || '',
                messageCount: Number(conversation.messageCount || 0),
                messages: Array.isArray(conversation.messages)
                    ? conversation.messages.map((m) => ({
                        role: m.role,
                        text: getDisplayTextForExport(m.text || '')
                    }))
                    : []
            }, null, 2);
        }

        function buildBatchConversationMarkdown(conversation, assistantLabel) {
            const header = `# ${conversation.title || `会话 ${conversation.conversationId || '-'}`}\n\n- 会话ID: ${conversation.conversationId || '-'}\n- 更新时间: ${conversation.updatedAtText || '-'}\n- 消息数: ${conversation.messageCount || 0}`;
            const body = (Array.isArray(conversation.messages) ? conversation.messages : []).map((m, idx) => `\n## ${idx + 1}. ${m.role === 'user' ? '用户' : assistantLabel}\n\n${getDisplayTextForExport(m.text || '')}\n`).join('\n');
            return `${header}\n${body}`.trim();
        }

        function buildBatchConversationText(conversation, assistantLabel) {
            const header = `${conversation.title || `会话 ${conversation.conversationId || '-'}`}\n会话ID: ${conversation.conversationId || '-'}\n更新时间: ${conversation.updatedAtText || '-'}\n消息数: ${conversation.messageCount || 0}`;
            const body = (Array.isArray(conversation.messages) ? conversation.messages : []).map((m, idx) => `\n[${idx + 1}] ${m.role === 'user' ? '用户' : assistantLabel}\n${getDisplayTextForExport(m.text || '')}`).join('\n');
            return `${header}\n${body}`.trim();
        }

        function buildBatchConversationCsv(conversation, assistantLabel) {
            const rows = ['Index,Role,Content'];
            const list = Array.isArray(conversation.messages) ? conversation.messages : [];
            list.forEach((m, idx) => {
                const role = m.role === 'user' ? '用户' : assistantLabel;
                const text = String(getDisplayTextForExport(m.text || '')).replace(/"/g, '""');
                rows.push(`${idx + 1},"${role}","${text}"`);
            });
            return '\uFEFF' + rows.join('\n');
        }

        function buildBatchConversationPrintableHtml(platform, conversation, assistantLabel) {
            const renderText = (txt) => escapeHtml(getDisplayTextForExport(txt || '')).replace(/\n/g, '<br>');
            const rows = (Array.isArray(conversation.messages) ? conversation.messages : []).map((m, idx) => `
                <div class="msg">
                    <div class="role">${idx + 1}. ${m.role === 'user' ? '用户' : assistantLabel}</div>
                    <div class="text">${renderText(m.text || '')}</div>
                </div>
            `).join('');
            return `
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>${escapeHtml(conversation.title || `会话 ${conversation.conversationId || '-'}`)}</title>
                    <style>
                        @page { size: A4; margin: 14mm; }
                        body { font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color:#0f172a; margin:0; padding:0; }
                        .head { margin-bottom: 14px; border-bottom: 2px solid #1d4ed8; padding-bottom: 8px; }
                        .platform { font-size: 12px; color: #64748b; margin-bottom: 6px; }
                        .title { font-size: 18px; font-weight: 700; }
                        .meta { margin-top: 6px; color: #475569; font-size: 12px; line-height: 1.6; }
                        .msg { border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px 12px; margin: 10px 0; }
                        .role { font-size: 12px; font-weight: 700; color: #1e40af; margin-bottom: 6px; }
                        .text { font-size: 13px; line-height: 1.7; white-space: normal; word-break: break-word; }
                    </style>
                </head>
                <body>
                    <section class="conv">
                        <div class="head">
                            <div class="platform">${escapeHtml(platform)} 批量导出</div>
                            <div class="title">${escapeHtml(conversation.title || `会话 ${conversation.conversationId || '-'}`)}</div>
                            <div class="meta">
                                会话ID: ${escapeHtml(conversation.conversationId || '-')}<br>
                                更新时间: ${escapeHtml(conversation.updatedAtText || '-')}<br>
                                消息数: ${escapeHtml(String(conversation.messageCount || 0))}
                            </div>
                        </div>
                        ${rows || '<div class="meta">该会话暂无可导出的消息内容。</div>'}
                    </section>
                </body>
                </html>
            `.trim();
        }

        async function exportBatchConversationsAsZip(platform, conversations, format, assistantLabel) {
            const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_');
            const usedNames = new Set();
            const entries = [];

            conversations.forEach((conversation, index) => {
                const titleBase = conversation.title || `会话 ${conversation.conversationId || index + 1}`;
                if (format === 'json') {
                    entries.push({
                        name: getUniqueBatchFileName(titleBase, 'json', usedNames),
                        data: buildBatchConversationJson(platform, conversation)
                    });
                    return;
                }
                if (format === 'md') {
                    entries.push({
                        name: getUniqueBatchFileName(titleBase, 'md', usedNames),
                        data: buildBatchConversationMarkdown(conversation, assistantLabel)
                    });
                    return;
                }
                if (format === 'pdf') {
                    entries.push({
                        name: getUniqueBatchFileName(titleBase, 'html', usedNames),
                        data: buildBatchConversationPrintableHtml(platform, conversation, assistantLabel)
                    });
                    return;
                }
                if (format === 'csv') {
                    entries.push({
                        name: getUniqueBatchFileName(titleBase, 'csv', usedNames),
                        data: buildBatchConversationCsv(conversation, assistantLabel)
                    });
                    return;
                }
                entries.push({
                    name: getUniqueBatchFileName(titleBase, 'txt', usedNames),
                    data: buildBatchConversationText(conversation, assistantLabel)
                });
            });

            if (format === 'pdf') {
                entries.push({
                    name: 'README.txt',
                    data: '已按单会话导出为可打印 HTML 文件。浏览器原生环境下无法稳定批量直接生成多个 PDF，请解压后分别打开 HTML 文件再打印为 PDF。'
                });
            }

            const zipBlob = createZipBlob(entries);
            const suffix = format === 'pdf' ? 'html' : format;
            downloadBlob(zipBlob, `${platform}_批量导出_${suffix}_${stamp}.zip`);
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

            if (typeof content === 'string') return cleanChatGPTText(applyChatGPTMessageReferences(content, msg));

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

            return cleanChatGPTText(applyChatGPTMessageReferences(String(raw).replace(/\n{3,}/g, '\n\n'), msg));
        }

        function extractChatGPTUserAttachmentText(msg) {
            const attachments = Array.isArray(msg?.metadata?.attachments) ? msg.metadata.attachments : [];
            if (!attachments.length) return '';

            const lines = attachments.map((item, idx) => {
                const name = String(item?.name || item?.filename || item?.file_name || '').trim() || `文件${idx + 1}`;
                return `[附件${idx + 1}: ${name}]`;
            }).filter(Boolean);

            return lines.join('\n');
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
                const attachmentText = author === 'user' ? extractChatGPTUserAttachmentText(msg) : '';
                const mergedText = [text, attachmentText].filter(Boolean).join(text && attachmentText ? '\n\n' : '');
                if (!mergedText) return;

                messages.push({
                    role: author,
                    text: mergedText,
                    html: chatMarkdownToHtml(mergedText),
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

            try {
                const convData = await fetchChatGPTConversationById(convId);
                return extractChatGPTMessagesFromMapping(convData);
            } catch (e) {
                console.warn('AI-Chat-Helper: ChatGPT 会话 API 解析失败', e);
                return [];
            }
        }

        const QWEN_MSG_LIST_PATH = '/api/v1/session/msg/list';
        const QWEN_PAGE_LIST_PATH = '/api/v2/session/page/list';
        const QWEN_DEFAULT_MSG_LIST_URL = 'https://chat2-api.qianwen.com/api/v1/session/msg/list?return_response_messages=true&biz_id=ai_qwen&event_filter=all&page_size=50&chat_client=h5&device=pc&fr=pc&pr=qwen&la=zh-CN&tz=Asia%2FShanghai';
        const QWEN_DEFAULT_PAGE_LIST_URL = 'https://chat2-api.qianwen.com/api/v2/session/page/list?biz_id=ai_qwen&chat_client=h5&device=pc&fr=pc&pr=qwen&la=zh-CN&tz=Asia%2FShanghai';
        const QWEN_FALLBACK_UT_KEY = 'AI-Chat-Helper-qwen-fallback-ut';

        function createNonce(len) {
            const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
            let out = '';
            for (let i = 0; i < len; i++) {
                out += chars[Math.floor(Math.random() * chars.length)];
            }
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

        function createFallbackQwenUt() {
            try {
                if (window.crypto && typeof window.crypto.randomUUID === 'function') {
                    return window.crypto.randomUUID();
                }
            } catch (e) {
                // ignore
            }

            return [
                createNonce(8),
                createNonce(4),
                createNonce(4),
                createNonce(4),
                createNonce(12)
            ].join('-');
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

        function getQwenSessionIdFromRawUrl(rawUrl) {
            try {
                if (!rawUrl) return '';
                const u = new URL(rawUrl, window.location.origin);
                return (u.searchParams.get('session_id') || '').trim();
            } catch (e) {
                return '';
            }
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

            try {
                const headers = qwenCapturedTemplate?.headers || {};
                const lower = {};
                Object.entries(headers).forEach(([k, v]) => {
                    lower[String(k).toLowerCase()] = String(v);
                });
                const headerUt = (
                    lower['x-deviceid']
                    || lower['x-qwen-ut']
                    || lower['qwen-ut']
                    || lower['ut']
                );
                if (headerUt) return String(headerUt);
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

            const cookieUt = [
                getCookieValue('ut'),
                getCookieValue('qwen_ut'),
                getCookieValue('deviceId'),
                getCookieValue('device_id'),
                getCookieValue('x-deviceid')
            ].find(Boolean);
            if (cookieUt) return String(cookieUt);

            try {
                const stored = localStorage.getItem(QWEN_FALLBACK_UT_KEY);
                if (stored) return String(stored);

                const generated = createFallbackQwenUt();
                localStorage.setItem(QWEN_FALLBACK_UT_KEY, generated);
                return generated;
            } catch (e) {
                return createFallbackQwenUt();
            }
        }

        function hasUsableQwenRequestTemplate() {
            if (!qwenCapturedTemplate?.url) return false;
            try {
                const u = new URL(qwenCapturedTemplate.url, window.location.origin);
                const ut = (u.searchParams.get('ut') || '').trim() || String(getQwenUtFromPage() || '').trim();
                if (!ut) return false;

                const headers = qwenCapturedTemplate?.headers || {};
                const lower = {};
                Object.entries(headers).forEach(([k, v]) => {
                    lower[String(k).toLowerCase()] = String(v);
                });

                return Boolean(
                    lower['x-deviceid']
                    || lower['x-xsrf-token']
                    || lower['clt-acs-sign']
                    || lower['eo-clt-actkn']
                );
            } catch (e) {
                return false;
            }
        }

        collectQwenMessagesFromPendingPayloads = function (targetSessionId = '') {
            if (!qwenPendingApiPayloads.length) return [];

            const pending = qwenPendingApiPayloads.splice(0, qwenPendingApiPayloads.length);
            const merged = [];
            const seenIds = new Set();

            pending.forEach((item) => {
                const itemSessionId = getQwenSessionIdFromRawUrl(item?.url || '');
                if (targetSessionId && itemSessionId && itemSessionId !== targetSessionId) {
                    qwenNodeLog('pending:drop-session-mismatch', {
                        source: item?.source || 'pending',
                        itemSessionId,
                        targetSessionId
                    });
                    return;
                }
                const json = safeParseJson(item?.rawText || '');
                if (!json) return;
                const parsed = parseQwenMessagesFromResponse(json);
                if (!parsed.length) return;
                qwenNodeLog('pending:consume', {
                    source: item?.source || 'pending',
                    url: item?.url || '',
                    parsedCount: parsed.length
                });
                parsed.forEach((msg) => {
                    const id = String(msg?.id || '').trim();
                    if (!id || seenIds.has(id)) return;
                    seenIds.add(id);
                    merged.push(msg);
                });
            });

            return merged.sort((a, b) => (a.order || 0) - (b.order || 0));
        };

        async function waitForQwenTemplateOrPending(timeoutMs = 6000) {
            const startedAt = Date.now();
            while (Date.now() - startedAt < timeoutMs) {
                if (qwenPendingApiPayloads.length > 0 || hasUsableQwenRequestTemplate()) {
                    return true;
                }
                await new Promise((resolve) => setTimeout(resolve, 250));
            }
            return qwenPendingApiPayloads.length > 0 || hasUsableQwenRequestTemplate();
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

        function buildQwenRequestHeaders(extraHeaders = null) {
            const headers = sanitizeQwenHeaders({
                ...(qwenCapturedTemplate?.headers || {}),
                ...(extraHeaders || {}),
                accept: 'application/json, text/plain, */*'
            });

            const xsrfToken = getCookieValue('XSRF-TOKEN');
            if (xsrfToken && !headers['x-xsrf-token']) {
                headers['x-xsrf-token'] = xsrfToken;
            }

            const ut = getQwenUtFromPage();
            if (ut && !headers['x-deviceid']) {
                headers['x-deviceid'] = ut;
            }

            return headers;
        }

        function normalizeQwenHttpMethod(method, fallback = 'GET') {
            const upper = String(method || '').trim().toUpperCase();
            if (upper === 'GET' || upper === 'POST') return upper;
            return fallback;
        }

        function getQwenAlternateHttpMethod(method) {
            return normalizeQwenHttpMethod(method, 'GET') === 'GET' ? 'POST' : 'GET';
        }

        function buildQwenRequestBodyFromTemplate() {
            if (!qwenCapturedTemplate?.body) return {};
            const parsed = safeParseJson(qwenCapturedTemplate.body);
            if (parsed && typeof parsed === 'object') return parsed;
            return {};
        }

        function ensureQwenRequestUrl(rawUrl, sessionId, extraParams = null) {
            const base = rawUrl || qwenCapturedTemplate?.url || QWEN_DEFAULT_MSG_LIST_URL;
            const u = new URL(base, window.location.origin);
            const isHistoryPage = Boolean(extraParams && Object.prototype.hasOwnProperty.call(extraParams, 'pos'));
            const preservedPageSize = (u.searchParams.get('page_size') || '').trim();
            const defaultPageSize = isHistoryPage ? '10' : (preservedPageSize || '5');

            if (!u.pathname.includes(QWEN_MSG_LIST_PATH)) {
                u.hostname = 'chat2-api.qianwen.com';
                u.pathname = QWEN_MSG_LIST_PATH;
            }

            const defaults = {
                return_response_messages: 'true',
                biz_id: 'ai_qwen',
                event_filter: 'all',
                page_size: defaultPageSize,
                chat_client: 'h5',
                device: 'pc',
                fr: 'pc',
                pr: 'qwen',
                la: 'zh-CN',
                tz: 'Asia/Shanghai'
            };

            Object.entries(defaults).forEach(([k, v]) => {
                u.searchParams.set(k, v);
            });

            // 基于抓包模板构造请求时，清掉历史翻页游标，避免直接落到某个旧分页。
            [
                'pos', 'cursor', 'offset', 'page', 'page_no', 'page_num',
                'next_cursor', 'nextCursor', 'start', 'start_time', 'end_time'
            ].forEach((k) => u.searchParams.delete(k));

            if (sessionId) u.searchParams.set('session_id', sessionId);

            const ut = getQwenUtFromPage();
            if (ut && !u.searchParams.get('ut')) u.searchParams.set('ut', ut);

            if (extraParams && typeof extraParams === 'object') {
                Object.entries(extraParams).forEach(([k, v]) => {
                    if (v == null || v === '') return;
                    u.searchParams.set(k, String(v));
                });
            }

            u.searchParams.set('nonce', createNonce(11));
            u.searchParams.set('timestamp', String(Date.now()));
            return u.toString();
        }

        function ensureQwenPageListUrl(rawUrl = '', extraParams = null) {
            const base = rawUrl || QWEN_DEFAULT_PAGE_LIST_URL;
            const u = new URL(base, window.location.origin);
            u.hostname = 'chat2-api.qianwen.com';
            u.pathname = QWEN_PAGE_LIST_PATH;

            const defaults = {
                biz_id: 'ai_qwen',
                chat_client: 'h5',
                device: 'pc',
                fr: 'pc',
                pr: 'qwen',
                la: 'zh-CN',
                tz: 'Asia/Shanghai'
            };

            Object.entries(defaults).forEach(([k, v]) => {
                u.searchParams.set(k, v);
            });

            const ut = getQwenUtFromPage();
            if (ut) u.searchParams.set('ut', ut);

            if (extraParams && typeof extraParams === 'object') {
                Object.entries(extraParams).forEach(([k, v]) => {
                    if (v == null || v === '') return;
                    u.searchParams.set(k, String(v));
                });
            }

            return u.toString();
        }

        function normalizeQwenBatchTimestamp(raw) {
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

        function extractQwenRecentConversations(respJson) {
            const buckets = [
                respJson?.data?.list,
                respJson?.data?.session_list,
                respJson?.data?.sessions,
                respJson?.data?.page_list,
                respJson?.list,
                respJson?.sessions
            ];
            const rawList = buckets.find((item) => Array.isArray(item)) || [];
            const seen = new Set();
            const out = [];

            rawList.forEach((item, idx) => {
                const id = String(findAny(item, [
                    'session_id', 'sessionId', 'id', 'uuid', 'conversation_id', 'conversationId'
                ]) || '').trim();
                if (!id || seen.has(id)) return;
                seen.add(id);

                const title = String(findAny(item, [
                    'title', 'name', 'session_name', 'session_title', 'topic', 'summary', 'display_title'
                ]) || `会话 ${idx + 1}`).trim();
                const modified = normalizeQwenBatchTimestamp(findAny(item, [
                    'modifiedTime', 'modified_time', 'updated_at', 'update_time', 'gmt_modified'
                ]));
                const created = normalizeQwenBatchTimestamp(findAny(item, [
                    'createdTime', 'created_time', 'created_at', 'create_time', 'gmt_create'
                ]));
                const badgeRaw = findAny(item, ['message_count', 'msg_count', 'badge_count', 'messageCount']);
                const badgeCount = Number(badgeRaw);

                out.push({
                    id,
                    title: title || `会话 ${id}`,
                    updatedAt: modified.value,
                    updatedAtText: modified.text,
                    createdAt: created.value,
                    createdAtText: created.text,
                    badgeCount: Number.isFinite(badgeCount) ? badgeCount : null
                });
            });

            return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        }

        function getQwenNextSessionToken(respJson) {
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

        async function fetchQwenRecentConversations(limit = 50, maxPages = 5) {
            const headers = buildQwenRequestHeaders({
                'content-type': 'application/json',
                'x-platform': 'pc_tongyi'
            });
            const merged = [];
            const seen = new Set();
            let nextToken = '';
            let page = 0;
            const totalLimit = Math.max(1, Number(limit) || 50);

            while (page < maxPages && merged.length < totalLimit) {
                page += 1;
                const url = ensureQwenPageListUrl();
                const remaining = Math.max(1, totalLimit - merged.length);
                const pageLimit = Math.min(50, remaining);
                const body = {
                    limit: pageLimit,
                    next_token: nextToken || '',
                    sort_field: 'modifiedTime',
                    need_filter_tag: true
                };

                const resp = await fetch(url, {
                    method: 'POST',
                    credentials: 'include',
                    headers,
                    body: JSON.stringify(body)
                });
                const rawText = await resp.text();
                const json = safeParseJson(rawText);

                if (!resp.ok) {
                    throw new Error(`会话列表请求失败: HTTP ${resp.status} ${rawText.slice(0, 300)}`);
                }
                if (!json) {
                    throw new Error('会话列表返回非 JSON');
                }

                const pageItems = extractQwenRecentConversations(json);
                pageItems.forEach((item) => {
                    if (merged.length >= totalLimit) return;
                    if (seen.has(item.id)) return;
                    seen.add(item.id);
                    merged.push(item);
                });

                nextToken = getQwenNextSessionToken(json);
                if (!nextToken || !pageItems.length || merged.length >= totalLimit) break;
            }

            return {
                conversations: merged.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
                requested: totalLimit,
                obtained: merged.length
            };
        }

        async function fetchQwenAllConversationMessages(sessionId, maxPages = 20, onProgress = () => {}) {
            const headers = buildQwenRequestHeaders();
            const baseUrl = qwenCapturedTemplate?.url || QWEN_DEFAULT_MSG_LIST_URL;
            let currentUrl = ensureQwenRequestUrl(baseUrl, sessionId, { page_size: 50 });
            let lastPos = '';
            let page = 0;
            const all = [];
            const seen = new Set();

            while (currentUrl && page < maxPages) {
                page += 1;
                const resp = await fetch(currentUrl, {
                    method: 'GET',
                    credentials: 'include',
                    headers
                });
                const rawText = await resp.text();
                const json = safeParseJson(rawText);

                if (!resp.ok) {
                    throw new Error(`消息请求失败: HTTP ${resp.status} ${rawText.slice(0, 300)}`);
                }
                if (!json) {
                    throw new Error('消息接口返回非 JSON');
                }

                const parsed = parseQwenMessagesFromResponse(json);
                parsed.forEach((m) => {
                    const id = String(m?.id || '').trim();
                    if (!id || seen.has(id)) return;
                    seen.add(id);
                    all.push(m);
                });

                const hasNext = Boolean(json?.data?.have_next_page);
                const nextPos = getQwenNextPagePos(json);
                onProgress({ page, count: all.length, hasMore: hasNext, cursor: nextPos });
                if (!hasNext || !nextPos || nextPos === lastPos) break;
                lastPos = nextPos;
                currentUrl = ensureQwenRequestUrl(baseUrl, sessionId, { page_size: 50, pos: nextPos });
            }

            return { messages: all.sort((a, b) => (a.order || 0) - (b.order || 0)), pages: page };
        }

        function getQwenNextPagePos(respJson) {
            const arr = Array.isArray(respJson?.data?.list) ? respJson.data.list : [];
            if (!arr.length) return '';

            const candidates = arr.map((item) => {
                const raw = item?.pos
                    ?? item?.position
                    ?? item?.request_timestamp
                    ?? item?.created_at
                    ?? item?.updated_at
                    ?? item?.create_time
                    ?? item?.update_time;
                const s = String(raw == null ? '' : raw).trim();
                return /^\d+$/.test(s) ? s : '';
            }).filter(Boolean);

            if (!candidates.length) return '';

            // 默认使用当前页中最早的 pos 继续向历史翻页。
            return candidates.reduce((min, cur) => (BigInt(cur) < BigInt(min) ? cur : min), candidates[0]);
        }

        function getQwenItemSortValue(item, fallbackIdx = 0) {
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
                const s = String(raw == null ? '' : raw).trim();
                if (/^\d+$/.test(s)) return Number(s);
                const ts = Date.parse(s);
                if (Number.isFinite(ts)) return ts;
            }

            return fallbackIdx;
        }

        function normalizeQwenMessageText(text) {
            const t = String(text || '').trim();
            if (!t) return '';
            // 去掉千问内部思考块标签前缀，如 [(multimodal_chat_think_1)]
            return t.replace(/^\[\([^)]+\)\]\s*/g, '').trim();
        }

        function collectQwenTextCandidates(value, out, depth = 0) {
            if (value == null || depth > 4) return;

            if (typeof value === 'string' || typeof value === 'number') {
                const text = normalizeQwenMessageText(String(value));
                if (text) out.push(text);
                return;
            }

            if (Array.isArray(value)) {
                value.forEach((v) => collectQwenTextCandidates(v, out, depth + 1));
                return;
            }

            if (typeof value !== 'object') return;

            const keys = [
                'content', 'text', 'value', 'display_text', 'prompt', 'question',
                'query', 'input', 'message', 'msg', 'caption', 'desc', 'description'
            ];
            keys.forEach((k) => {
                if (Object.prototype.hasOwnProperty.call(value, k)) {
                    collectQwenTextCandidates(value[k], out, depth + 1);
                }
            });

            if (Array.isArray(value.parts)) collectQwenTextCandidates(value.parts, out, depth + 1);
            if (Array.isArray(value.segments)) collectQwenTextCandidates(value.segments, out, depth + 1);
            if (Array.isArray(value.blocks)) collectQwenTextCandidates(value.blocks, out, depth + 1);
            if (Array.isArray(value.messages)) collectQwenTextCandidates(value.messages, out, depth + 1);
        }

        function isLikelyUserRole(rawRole) {
            const role = String(rawRole || '').toLowerCase();
            return role.includes('user') || role.includes('human') || role.includes('question') || role === 'u';
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

        function collectQwenAttachmentNames(value, out, depth = 0) {
            if (depth > 6 || value == null) return;
            if (Array.isArray(value)) {
                value.forEach((item) => collectQwenAttachmentNames(item, out, depth + 1));
                return;
            }
            if (typeof value !== 'object') return;

            const pushName = (name) => {
                const clean = normalizeQwenMessageText(name);
                if (clean) out.push(clean);
            };

            const directName = String(
                value?.file_name
                || value?.filename
                || value?.name
                || ''
            ).trim();
            if (directName) pushName(directName);

            const resourceInfos = Array.isArray(value?.resource_infos) ? value.resource_infos : [];
            resourceInfos.forEach((r) => {
                const name = String(r?.file_name || r?.filename || r?.name || '').trim();
                if (name) pushName(name);
            });

            Object.values(value).forEach((v) => {
                if (v && typeof v === 'object') collectQwenAttachmentNames(v, out, depth + 1);
            });
        }

        function extractQwenAttachmentTexts(messageLike) {
            const names = [];
            collectQwenAttachmentNames(messageLike, names, 0);
            const uniq = Array.from(new Set(names.filter(Boolean)));
            return uniq.map((name, idx) => `[附件${uniq.length > 1 ? idx + 1 : ''}] ${name}`);
        }

        function extractQwenUserTexts(item) {
            const req = Array.isArray(item?.request_messages) ? item.request_messages : [];
            const out = [];

            req.forEach((m) => {
                const mime = String(m?.mime_type || '').toLowerCase();
                if (mime === 'image/url') return;

                const attachmentTexts = extractQwenAttachmentTexts(m);
                attachmentTexts.forEach((line) => {
                    const clean = normalizeQwenMessageText(line);
                    if (clean) out.push(clean);
                });

                const bucket = [];
                collectQwenTextCandidates(m, bucket);
                bucket.forEach((text) => {
                    const clean = normalizeQwenMessageText(text);
                    if (clean) out.push(clean);
                });
            });

            // 一些千问返回结构不再提供 request_messages，用户问题可能出现在 item 根字段或 messages 中。
            const fallbackBucket = [];
            collectQwenTextCandidates({
                query: item?.query,
                question: item?.question,
                prompt: item?.prompt,
                input: item?.input,
                user_message: item?.user_message,
                user_msg: item?.user_msg,
                request: item?.request
            }, fallbackBucket);
            fallbackBucket.forEach((text) => {
                const clean = normalizeQwenMessageText(text);
                if (clean) out.push(clean);
            });

            const mixedMessages = Array.isArray(item?.messages) ? item.messages : [];
            mixedMessages.forEach((m) => {
                if (!isLikelyUserRole(m?.role || m?.sender_role || m?.author_role || m?.type)) return;
                const bucket = [];
                collectQwenTextCandidates(m, bucket);
                bucket.forEach((text) => {
                    const clean = normalizeQwenMessageText(text);
                    if (clean) out.push(clean);
                });
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
                const baseOrder = getQwenItemSortValue(item, idx + 1) * 10;
                const reqId = String(item?.req_id || item?.request_id || `qwen-req-${idx + 1}`);
                const userTexts = extractQwenUserTexts(item);
                const mergedUserText = Array.from(new Set(
                    userTexts
                        .map((t) => normalizeQwenMessageText(t))
                        .filter(Boolean)
                )).join('\n');
                if (mergedUserText) {
                    out.push({ id: normalizeQwenMessageId(reqId), role: 'user', text: mergedUserText, order: baseOrder + 1 });
                }

                const assistantTexts = extractQwenAssistantTexts(item);
                assistantTexts.forEach((text, i) => {
                    out.push({ id: `${reqId}-a-${i + 1}`, role: 'assistant', text, order: baseOrder + 2 + i });
                });
            });

            qwenNodeLog('api:parsed', {
                listCount: arr.length,
                parsedCount: out.length,
                userCount: out.filter((m) => m.role === 'user').length,
                assistantCount: out.filter((m) => m.role === 'assistant').length,
                firstItemKeys: Object.keys(arr[0] || {}).slice(0, 16)
            });

            const sorted = out.sort((a, b) => (a.order || 0) - (b.order || 0));
            let userSessionIndex = 0;
            sorted.forEach((msg) => {
                if (msg && msg.role === 'user') {
                    msg.sessionIndex = userSessionIndex;
                    userSessionIndex += 1;
                }
            });
            return sorted;
        }

        function captureQwenTemplateFromResponse(respJson, requestUrl, requestHeaders = null) {
            const arr = Array.isArray(respJson?.data?.list) ? respJson.data.list : [];
            let responseHeaders = {};

            for (const item of arr) {
                if (!item || typeof item !== 'object') continue;
                const rawHeader = typeof item.header === 'string' ? item.header.trim() : '';
                if (!rawHeader) continue;
                const parsedHeader = safeParseJson(rawHeader);
                if (parsedHeader && typeof parsedHeader === 'object') {
                    responseHeaders = parsedHeader;
                    break;
                }
            }

            const mergedHeaders = {
                ...parseHeadersObject(requestHeaders),
                ...parseHeadersObject(responseHeaders)
            };

            let finalUrl = requestUrl || qwenCapturedTemplate?.url || QWEN_DEFAULT_MSG_LIST_URL;
            try {
                const u = new URL(finalUrl, window.location.origin);
                const ut = (
                    u.searchParams.get('ut')
                    || responseHeaders['x-deviceid']
                    || responseHeaders['X-DeviceId']
                    || responseHeaders['ut']
                    || getQwenUtFromPage()
                );
                if (ut && !u.searchParams.get('ut')) {
                    u.searchParams.set('ut', String(ut));
                }
                finalUrl = u.toString();
            } catch (e) {
                // ignore
            }

            qwenCapturedTemplate = {
                url: finalUrl,
                method: 'GET',
                headers: mergedHeaders,
                body: ''
            };
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

        installQwenCaptureHooks = function () {
            if (!isQwen || qwenCaptureHooksInstalled) return;
            qwenCaptureHooksInstalled = true;

            const nativeFetch = window.fetch;
            window.fetch = function (input, init) {
                const resp = nativeFetch.apply(this, arguments);
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

                        Promise.resolve(resp).then((r) => {
                            if (!r || !r.ok || typeof r.clone !== 'function') return;
                            return r.clone().text().then((rawText) => {
                                if (qwenInternalFetchDepth > 0) return;
                                const json = safeParseJson(rawText);
                                if (!json) return;
                                captureQwenTemplateFromResponse(json, url, headers);
                                const parsed = parseQwenMessagesFromResponse(json);
                                if (!parsed.length) return;
                                qwenNodeLog('hook:fetch-response', {
                                    url,
                                    parsedCount: parsed.length
                                });
                                queueQwenPendingApiPayload(url, rawText, 'fetch-hook');
                            }).catch(() => {
                                // ignore response clone errors
                            });
                        }).catch(() => {
                            // ignore response handling errors
                        });
                    }
                } catch (e) {
                    console.warn('AI-Chat-Helper: 安装千问 fetch 抓包钩子时出现异常', e);
                }
                return resp;
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

                        this.addEventListener('load', () => {
                            try {
                                if (qwenInternalFetchDepth > 0) return;
                                if (this.status < 200 || this.status >= 300) return;
                                const rawText = typeof this.responseText === 'string' ? this.responseText : '';
                                const json = safeParseJson(rawText);
                                if (!json) return;
                                captureQwenTemplateFromResponse(json, this.__aiNodesQwenUrl, this.__aiNodesQwenHeaders);
                                const parsed = parseQwenMessagesFromResponse(json);
                                if (!parsed.length) return;
                                qwenNodeLog('hook:xhr-response', {
                                    url: this.__aiNodesQwenUrl,
                                    parsedCount: parsed.length
                                });
                                queueQwenPendingApiPayload(this.__aiNodesQwenUrl, rawText, 'xhr-hook');
                            } catch (e) {
                                // ignore xhr parse errors
                            }
                        }, { once: true });
                    }
                } catch (e) {
                    console.warn('AI-Chat-Helper: 安装千问 XHR 抓包钩子时出现异常', e);
                }
                return nativeSend.apply(this, arguments);
            };
        };

        async function fetchQwenUserNodesByTemplate() {
            const sessionId = getQwenSessionIdFromUrl();
            if (!sessionId) {
                qwenNodeLog('node-api:no-session-id', { href: window.location.href });
                return [];
            }

            const baseUrl = qwenCapturedTemplate?.url || QWEN_DEFAULT_MSG_LIST_URL;
            let requestMethod = normalizeQwenHttpMethod(qwenCapturedTemplate?.method, 'GET');
            const bodyObj = buildQwenRequestBodyFromTemplate();
            const seen = new Set();
            const merged = [];
            let pos = '';
            let page = 0;
            const maxPages = 30;

            try {
                qwenSuppressCapturedPayloads += 1;
                while (page < maxPages) {
                    page += 1;
                    const currentUrl = ensureQwenRequestUrl(baseUrl, sessionId, pos ? { pos } : null);
                    markQwenInternalRequest(currentUrl);

                    let resp = null;
                    for (let attempt = 0; attempt < 2; attempt += 1) {
                        const headers = buildQwenRequestHeaders();
                        if (requestMethod === 'GET' && headers['content-type']) delete headers['content-type'];
                        const fetchInit = {
                            method: requestMethod,
                            credentials: 'include',
                            headers
                        };
                        if (requestMethod !== 'GET') fetchInit.body = JSON.stringify(bodyObj || {});

                        qwenInternalFetchDepth += 1;
                        try {
                            resp = await fetch(currentUrl, fetchInit);
                        } finally {
                            qwenInternalFetchDepth = Math.max(0, qwenInternalFetchDepth - 1);
                        }
                        if (resp.status !== 405) break;

                        const fallback = getQwenAlternateHttpMethod(requestMethod);
                        qwenNodeLog('node-api:method-fallback', { page, from: requestMethod, to: fallback, status: resp.status });
                        requestMethod = fallback;
                    }

                    if (!resp || !resp.ok) {
                        const raw = resp ? await resp.text().catch(() => '') : '';
                        qwenNodeLog('node-api:request-failed', { page, status: resp?.status || 0, sample: String(raw || '').slice(0, 180) });
                        break;
                    }

                    const rawText = await resp.text();
                    const json = safeParseJson(rawText);
                    if (!json) {
                        qwenNodeLog('node-api:non-json', { page });
                        break;
                    }

                    captureQwenTemplateFromResponse(json, currentUrl, buildQwenRequestHeaders());

                    const parsedUsers = parseQwenMessagesFromResponse(json)
                        .filter((m) => m && m.role === 'user' && m.text)
                        .map((m) => ({
                            id: `api-user-${normalizeQwenMessageId(m?.id || '') || String(m?.id || '')}`,
                            sourceMessageId: normalizeQwenMessageId(m?.id || ''),
                            role: 'user',
                            text: normalizeQwenTextForMatch(m?.text || ''),
                            order: Number(m?.order || 0)
                        }))
                        .filter((m) => m.text);

                    const pageAdded = [];
                    parsedUsers.forEach((item) => {
                        const key = `${item.sourceMessageId || item.id}::${item.text.slice(0, 64)}`;
                        if (seen.has(key)) return;
                        seen.add(key);
                        pageAdded.push(item);
                    });

                    if (pageAdded.length) {
                        if (page === 1) merged.push(...pageAdded);
                        else merged.unshift(...pageAdded);
                    }

                    const hasNext = Boolean(json?.data?.have_next_page);
                    const nextPos = String(getQwenNextPagePos(json) || '').trim();
                    qwenNodeLog('node-api:page', {
                        page,
                        added: pageAdded.length,
                        total: merged.length,
                        hasNext,
                        pos: nextPos || '-'
                    });
                    if (!hasNext || !nextPos || nextPos === pos) break;
                    pos = nextPos;
                }

                const finalList = merged.map((item, idx) => ({
                    id: item.id || `api-user-qwen-${idx + 1}`,
                    sourceMessageId: item.sourceMessageId || '',
                    role: 'user',
                    text: item.text,
                    order: idx + 1,
                    sessionIndex: idx
                }));
                return finalList;
            } catch (e) {
                qwenNodeLog('node-api:error', { message: String(e?.message || e) });
                return [];
            } finally {
                qwenSuppressCapturedPayloads = Math.max(0, qwenSuppressCapturedPayloads - 1);
            }
        }

        async function fetchQwenMessagesByTemplate() {
            const sessionId = getQwenSessionIdFromUrl();
            if (!sessionId) {
                qwenNodeLog('api:no-session-id', { href: window.location.href });
                return [];
            }
            const baseUrl = qwenCapturedTemplate?.url || QWEN_DEFAULT_MSG_LIST_URL;
            const initialUrl = ensureQwenRequestUrl(baseUrl, sessionId);
            let requestMethod = normalizeQwenHttpMethod(qwenCapturedTemplate?.method, 'GET');
            const bodyObj = buildQwenRequestBodyFromTemplate();

            qwenNodeLog('api:request-start', {
                hasTemplate: Boolean(qwenCapturedTemplate?.url),
                reqMethod: requestMethod,
                hasBody: Boolean(Object.keys(bodyObj).length),
                reqUrl: initialUrl
            });

            try {
                qwenSuppressCapturedPayloads += 1;
                const allParsed = [];
                const seenIds = new Set();
                let currentUrl = initialUrl;
                let page = 0;
                let lastPos = '';

                while (currentUrl && page < 20) {
                    page += 1;
                    markQwenInternalRequest(currentUrl);
                    qwenInternalFetchDepth += 1;
                    let resp;
                    try {
                        for (let attempt = 0; attempt < 2; attempt += 1) {
                            const headers = buildQwenRequestHeaders();
                            if (requestMethod === 'GET' && headers['content-type']) {
                                delete headers['content-type'];
                            }
                            const fetchInit = {
                                method: requestMethod,
                                credentials: 'include',
                                headers
                            };
                            if (requestMethod !== 'GET') {
                                fetchInit.body = JSON.stringify(bodyObj || {});
                            }
                            resp = await fetch(currentUrl, fetchInit);
                            if (resp.status !== 405) break;
                            const fallback = getQwenAlternateHttpMethod(requestMethod);
                            qwenNodeLog('api:method-fallback', {
                                page,
                                status: resp.status,
                                from: requestMethod,
                                to: fallback
                            });
                            requestMethod = fallback;
                        }
                    } finally {
                        qwenInternalFetchDepth = Math.max(0, qwenInternalFetchDepth - 1);
                    }

                    const rawText = await resp.text();
                    if (!resp.ok) {
                        console.warn(`AI-Chat-Helper: 千问会话 API 请求失败 (${resp.status})`, rawText.slice(0, 400));
                        break;
                    }

                    const json = safeParseJson(rawText);
                    if (!json) {
                        console.warn('AI-Chat-Helper: 千问会话 API 返回非 JSON 响应');
                        break;
                    }

                    captureQwenTemplateFromResponse(json, currentUrl, buildQwenRequestHeaders());

                    const parsed = parseQwenMessagesFromResponse(json);
                    parsed.forEach((item) => {
                        const id = String(item?.id || '').trim();
                        if (!id || seenIds.has(id)) return;
                        seenIds.add(id);
                        allParsed.push(item);
                    });

                    const hasNext = Boolean(json?.data?.have_next_page);
                    const nextPos = getQwenNextPagePos(json);

                    qwenNodeLog('api:page', {
                        page,
                        reqUrl: currentUrl,
                        parsedCount: parsed.length,
                        totalParsed: allParsed.length,
                        hasNext,
                        nextPos
                    });

                    if (!hasNext || !nextPos || nextPos === lastPos) break;
                    lastPos = nextPos;
                    currentUrl = ensureQwenRequestUrl(baseUrl, sessionId, { pos: nextPos });
                }

                if (allParsed.length) {
                    qwenNodeLog('api:success', { reqUrl: initialUrl, parsedCount: allParsed.length, pages: page });
                    return allParsed.sort((a, b) => (a.order || 0) - (b.order || 0));
                }

                console.warn('AI-Chat-Helper: 千问导出失败，候选请求均未获取到消息');
                return [];
            } catch (e) {
                console.warn('AI-Chat-Helper: 千问会话 API 解析失败', e);
                return [];
            } finally {
                qwenSuppressCapturedPayloads = Math.max(0, qwenSuppressCapturedPayloads - 1);
            }
        }

    function maybeHydrateQwenHistory(triggerSource = 'unknown') {
        if (!isQwen || qwenHistoryHydrationInFlight || !hasUsableQwenRequestTemplate()) return;

        const sessionId = getQwenSessionIdFromUrl();
        const hydrateStorageKey = storageKey;
        if (!sessionId) return;
        const cacheSig = qwenVirtualNodesCache.map((m) => String(m.id || '')).filter(Boolean).join('|');
        if (qwenLastHydratedSessionId === sessionId && qwenLastHydrationSignature === cacheSig && cacheSig) {
            return;
        }

            qwenHistoryHydrationInFlight = true;
            qwenNodeLog('hydrate:start', {
                triggerSource,
                sessionId,
                cacheSize: qwenVirtualNodesCache.length
            });

        fetchQwenMessagesByTemplate().then((apiMsgs) => {
            if (hydrateStorageKey !== storageKey) return;
            if (!Array.isArray(apiMsgs) || !apiMsgs.length) return;
            applyQwenApiMessagesToCache(apiMsgs, 'hydrate');
            qwenLastHydratedSessionId = sessionId;
            qwenLastHydrationSignature = apiMsgs
                .filter((m) => m && m.role === 'user')
                    .map((m) => String(m.id || ''))
                    .filter(Boolean)
                    .join('|');
                qwenNodeLog('hydrate:done', {
                    sessionId,
                    totalCount: apiMsgs.length,
                    userCount: apiMsgs.filter((m) => m && m.role === 'user').length
                });
            }).catch((e) => {
                console.warn('AI-Chat-Helper: 千问历史补全失败', e);
            }).finally(() => {
                qwenHistoryHydrationInFlight = false;
            });
        }

        getQwenMessagesByApi = async function () {
            if (!isQwen) return [];
            installQwenCaptureHooks();

            if (!hasUsableQwenRequestTemplate()) {
                qwenNodeLog('api:direct-fetch', {
                    hasTemplate: Boolean(qwenCapturedTemplate?.url),
                    hasUt: Boolean(getQwenUtFromPage()),
                    headerKeys: Object.keys(qwenCapturedTemplate?.headers || {}).slice(0, 12)
                });
            }

            return fetchQwenUserNodesByTemplate();
        };

        async function getQwenMessagesForExport() {
            if (!isQwen) return [];
            installQwenCaptureHooks();

            const pendingMsgs = collectQwenMessagesFromPendingPayloads();
            if (pendingMsgs.length) {
                qwenNodeLog('export:from-pending', { count: pendingMsgs.length });
                return pendingMsgs;
            }

            if (!hasUsableQwenRequestTemplate()) {
                qwenNodeLog('export:direct-fetch', {
                    hasTemplate: Boolean(qwenCapturedTemplate?.url),
                    hasUt: Boolean(getQwenUtFromPage()),
                    headerKeys: Object.keys(qwenCapturedTemplate?.headers || {}).slice(0, 12)
                });
            }

            const pendingAfterWait = collectQwenMessagesFromPendingPayloads();
            if (pendingAfterWait.length) {
                qwenNodeLog('export:from-pending', { count: pendingAfterWait.length });
                return pendingAfterWait;
            }

            const apiMsgs = await fetchQwenMessagesByTemplate();
            if (Array.isArray(apiMsgs) && apiMsgs.length) {
                return apiMsgs;
            }

            qwenNodeLog('export:no-data', {
                hasTemplate: Boolean(qwenCapturedTemplate?.url),
                hasUt: Boolean(getQwenUtFromPage()),
                headerKeys: Object.keys(qwenCapturedTemplate?.headers || {}).slice(0, 12)
            });
            return [];
        };

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

        

        function safeParseJson(text) {
            try {
                return JSON.parse(text);
            } catch (e) {
                return null;
            }
        }

        function parseBoolLike(value) {
            if (typeof value === 'boolean') return value;
            if (typeof value === 'number') return value !== 0;
            const s = String(value == null ? '' : value).trim().toLowerCase();
            if (!s) return false;
            if (s === '0' || s === 'false' || s === 'no' || s === 'off' || s === 'null') return false;
            return true;
        }

        function isDoubaoSingleChainUrl(rawUrl) {
            try {
                const u = new URL(rawUrl, window.location.origin);
                return /\/im\/chain\/single$/i.test(u.pathname);
            } catch (e) {
                return false;
            }
        }

        function isDoubaoRecentConvUrl(rawUrl) {
            try {
                const u = new URL(rawUrl, window.location.origin);
                return /\/im\/chain\/recent_conv$/i.test(u.pathname);
            } catch (e) {
                return false;
            }
        }

        function isDoubaoMcsListUrl(rawUrl) {
            try {
                const u = new URL(rawUrl, window.location.origin);
                return /(^|\.)mcs\.doubao\.com$/i.test(u.hostname) && /\/list$/i.test(u.pathname);
            } catch (e) {
                return false;
            }
        }

        function captureDoubaoMcsListRequest(url, method, headers, bodyText) {
            if (!isDoubaoMcsListUrl(url)) return;
            doubaoCapturedMcsListRequest = {
                url: String(url || 'https://mcs.doubao.com/list'),
                method: String(method || 'GET').toUpperCase(),
                headers: sanitizeDoubaoHeaders(parseHeadersObject(headers)),
                bodyText: typeof bodyText === 'string' ? bodyText : (bodyText != null ? String(bodyText) : ''),
                ts: Date.now()
            };
        }

        async function preflightDoubaoMcsList() {
            const captured = doubaoCapturedMcsListRequest;
            const hasCaptured = Boolean(captured && captured.url);
            const url = hasCaptured ? captured.url : 'https://mcs.doubao.com/list';
            let method = hasCaptured ? String(captured.method || 'POST').toUpperCase() : 'POST';

            // OPTIONS 是浏览器自动发起的预检，业务请求应发送 POST。
            if (method === 'OPTIONS') method = 'POST';

            const headers = hasCaptured
                ? sanitizeDoubaoHeaders(captured.headers || {})
                : { accept: '*/*', 'content-type': 'application/json;charset=utf-8' };

            if (!headers.accept) headers.accept = 'application/json, text/plain, */*';
            if (method === 'GET' || method === 'HEAD') {
                delete headers['content-type'];
            } else if (!headers['content-type']) {
                headers['content-type'] = 'application/json;charset=utf-8';
            }

            const init = {
                method,
                credentials: 'include',
                headers
            };

            if (method !== 'GET' && method !== 'HEAD') {
                if (hasCaptured && captured.bodyText) {
                    init.body = captured.bodyText;
                } else {
                    init.body = '{}';
                }
            }

            try {
                await fetch(url, init);
            } catch (e) {
                // mcs 预热失败不应阻断 recent_conv 分页
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

        installDoubaoCaptureHooks = function () {
            if (!isDoubao || doubaoCaptureHooksInstalled) return;
            doubaoCaptureHooksInstalled = true;

            const rawFetch = window.fetch;
            window.fetch = function (input, init) {
                try {
                    const inputUrl = typeof input === 'string' ? input : input?.url;
                    const url = inputUrl ? new URL(inputUrl, window.location.origin).toString() : '';
                    const method = (init?.method || input?.method || 'GET').toUpperCase();
                    if (url && isDoubaoRecentConvUrl(url)) {
                        doubaoCapturedRecentConvUrl = url;
                        if (method === 'POST') {
                            const body = init?.body;
                            if (typeof body === 'string') {
                                doubaoCapturedRecentConvBodyText = body;
                            } else if (body != null) {
                                doubaoCapturedRecentConvBodyText = String(body);
                            } else if (typeof Request !== 'undefined' && input instanceof Request) {
                                input.clone().text().then((txt) => {
                                    doubaoCapturedRecentConvBodyText = txt || '';
                                }).catch(() => {
                                    // ignore
                                });
                            }
                        }
                    }
                    if (url && isDoubaoMcsListUrl(url)) {
                        const headers = init?.headers || input?.headers;
                        const body = init?.body;
                        if (typeof body === 'string') {
                            captureDoubaoMcsListRequest(url, method, headers, body);
                        } else if (body != null) {
                            captureDoubaoMcsListRequest(url, method, headers, String(body));
                        } else if (typeof Request !== 'undefined' && input instanceof Request) {
                            input.clone().text().then((txt) => {
                                captureDoubaoMcsListRequest(url, method, headers, txt || '');
                            }).catch(() => {
                                captureDoubaoMcsListRequest(url, method, headers, '');
                            });
                        } else {
                            captureDoubaoMcsListRequest(url, method, headers, '');
                        }
                    }
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
                    console.warn('AI-Chat-Helper: 安装 fetch 抓包模板时出现异常', e);
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
                    if (isDoubaoRecentConvUrl(this.__aiNodesDoubaoUrl)) {
                        doubaoCapturedRecentConvUrl = this.__aiNodesDoubaoUrl;
                        if (this.__aiNodesDoubaoMethod === 'POST') {
                            doubaoCapturedRecentConvBodyText = typeof body === 'string' ? body : (body != null ? String(body) : '');
                        }
                    }
                    if (isDoubaoMcsListUrl(this.__aiNodesDoubaoUrl)) {
                        captureDoubaoMcsListRequest(
                            this.__aiNodesDoubaoUrl,
                            this.__aiNodesDoubaoMethod,
                            this.__aiNodesDoubaoHeaders,
                            typeof body === 'string' ? body : (body != null ? String(body) : '')
                        );
                    }
                    if (this.__aiNodesDoubaoMethod === 'POST' && isDoubaoSingleChainUrl(this.__aiNodesDoubaoUrl)) {
                        const bodyText = typeof body === 'string' ? body : (body != null ? String(body) : '');
                        captureDoubaoTemplate(this.__aiNodesDoubaoUrl, 'POST', this.__aiNodesDoubaoHeaders, bodyText);
                    }
                } catch (e) {
                    console.warn('AI-Chat-Helper: 安装 XHR 抓包模板时出现异常', e);
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

        function rememberDoubaoWebTabId(id) {
            const tabId = String(id || '').trim();
            if (!tabId) return '';
            sessionStorage.setItem('ai-nodes-doubao-web-tab-id', tabId);
            return tabId;
        }

        function getDoubaoWebTabIdFromUrl(rawUrl) {
            try {
                const u = new URL(rawUrl, window.location.origin);
                return String(u.searchParams.get('web_tab_id') || '').trim();
            } catch (e) {
                return '';
            }
        }

        function getDoubaoWebTabIdCandidates(customUrl = '') {
            const out = [];
            const seen = new Set();

            const push = (value) => {
                const id = String(value || '').trim();
                if (!id || seen.has(id)) return;
                seen.add(id);
                out.push(id);
            };

            push(getDoubaoWebTabIdFromUrl(customUrl));
            push(getDoubaoWebTabIdFromUrl(window.location.href));
            push(getDoubaoWebTabIdFromUrl(doubaoCapturedRecentConvUrl));
            push(getDoubaoWebTabIdFromUrl(doubaoCapturedTemplate?.url || ''));
            push(sessionStorage.getItem('ai-nodes-doubao-web-tab-id') || '');

            try {
                const entries = performance.getEntriesByType('resource') || [];
                for (let i = entries.length - 1; i >= 0; i--) {
                    const name = entries[i] && entries[i].name ? entries[i].name : '';
                    if (!/\/im\/chain\/(single|recent_conv)\?/i.test(name)) continue;
                    push(getDoubaoWebTabIdFromUrl(name));
                    if (out.length >= 5) break;
                }
            } catch (e) {
                // ignore
            }

            if (!out.length) push(genUuid());
            return out;
        }

        function ensureDoubaoRecentConvUrl(rawUrl, preferredWebTabId = '', keepOriginalQuery = false) {
            const base = rawUrl || doubaoCapturedRecentConvUrl || `${window.location.origin}/im/chain/recent_conv`;
            const u = new URL(base, window.location.origin);

            if (!keepOriginalQuery) {
                const defaults = new URLSearchParams(DOUBAO_QUERY_DEFAULTS);
                defaults.forEach((v, k) => {
                    if (!u.searchParams.has(k)) u.searchParams.set(k, v);
                });
            }

            const tabId = String(preferredWebTabId || u.searchParams.get('web_tab_id') || sessionStorage.getItem('ai-nodes-doubao-web-tab-id') || genUuid()).trim();
            if (tabId) u.searchParams.set('web_tab_id', rememberDoubaoWebTabId(tabId));

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
                console.warn('AI-Chat-Helper: 读取 performance 记录失败', e);
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

                // content 内可能嵌入结构化 JSON，优先转成可读摘要，避免原始 JSON 泄露到导出。
                const structured = parseDoubaoContentPayload(t);
                if (structured && structured !== t) {
                    structured
                        .split(/\r?\n/)
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .forEach((line) => pushText(line));
                    return;
                }

                if (/^[0-9]{14,}$/.test(t)) return;
                if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t)) return;
                if (/^tos-cn-i-[a-z0-9-]+\//i.test(t)) return;
                if (/^R[A-Za-z0-9]{20,}$/i.test(t)) return;
                if (/^https?:\/\//i.test(t) && /(byteimg|byteimg\.com|byteimg\.com\.cn|byteimg\.com\.cn|tos-cn-|flow-sign\.byteimg\.com|flow-imagex-sign\.byteimg\.com)/i.test(t)) return;
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

        function parseDoubaoContentPayload(contentValue, depth = 0) {
            if (typeof contentValue !== 'string') return '';

            const raw = contentValue.trim();
            if (!raw) return '';
            if (depth > 3) return raw;

            const parsed = safeParseJson(raw);
            if (parsed == null) return raw;

            // 豆包有时把 JSON 再序列化成字符串，需递归解包（例如 "{\"entities\":[...]}").
            if (typeof parsed === 'string') {
                const nested = parsed.trim();
                if (!nested) return '';
                if (nested === raw) return nested;
                return parseDoubaoContentPayload(nested, depth + 1);
            }
            if (typeof parsed !== 'object') return raw;

            // 豆包有时把 blocks 数组序列化塞进 content，避免原样输出原始 JSON。
            if (Array.isArray(parsed)) {
                const extracted = extractDoubaoTextFromBlocks(parsed);
                return extracted || '';
            }

            const lines = [];
            const text = typeof parsed.text === 'string' ? parsed.text.trim() : '';
            if (text) lines.push(text);

            if (!text && typeof parsed.content === 'string' && parsed.content.trim()) {
                const contentText = parseDoubaoContentPayload(parsed.content, depth + 1);
                if (contentText) lines.push(contentText);
            }

            const entities = Array.isArray(parsed.entities) ? parsed.entities : [];
            const fileNames = [];
            entities.forEach((entity, idx) => {
                if (!entity || typeof entity !== 'object') return;
                const file = entity?.entity_content?.file || entity?.file || null;
                const fileName = typeof file?.file_name === 'string'
                    ? file.file_name.trim()
                    : (typeof file?.name === 'string' ? file.name.trim() : '');
                if (fileName) {
                    fileNames.push(fileName);
                    return;
                }

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

            fileNames.forEach((name, idx) => {
                const serial = fileNames.length > 1 ? String(idx + 1) : '';
                lines.push(`[附件${serial}] ${name}`);
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

        function formatDoubaoTime(ts) {
            const n = Number(ts || 0);
            if (!Number.isFinite(n) || n <= 0) return '';
            const ms = n > 1e12 ? n : Math.round(n * 1000);
            const d = new Date(ms);
            if (Number.isNaN(d.getTime())) return '';
            return d.toLocaleString();
        }

        function getDoubaoStringByPath(obj, path) {
            const parts = String(path || '').split('.').filter(Boolean);
            let cur = obj;
            for (const p of parts) {
                if (!cur || typeof cur !== 'object') return '';
                cur = cur[p];
            }
            return typeof cur === 'string' ? cur.trim() : '';
        }

        function getDoubaoNumberByPath(obj, path) {
            const parts = String(path || '').split('.').filter(Boolean);
            let cur = obj;
            for (const p of parts) {
                if (!cur || typeof cur !== 'object') return null;
                cur = cur[p];
            }
            const n = Number(cur);
            return Number.isFinite(n) ? n : null;
        }

        function findDoubaoNestedConversationTitle(obj, maxDepth = 5) {
            if (!obj || typeof obj !== 'object' || maxDepth < 0) return '';

            const keys = ['name', 'title', 'conversation_title', 'conv_title', 'chat_title', 'display_title'];
            for (const key of keys) {
                const val = typeof obj[key] === 'string' ? obj[key].trim() : '';
                if (val && !/^[0-9]{8,}$/.test(val)) return val;
            }

            if (maxDepth === 0) return '';
            for (const v of Object.values(obj)) {
                if (!v || typeof v !== 'object') continue;
                const nested = findDoubaoNestedConversationTitle(v, maxDepth - 1);
                if (nested) return nested;
            }
            return '';
        }

        function resolveDoubaoConversationTitle(item, id) {
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
                const val = getDoubaoStringByPath(item, p);
                if (val && !/^[0-9]{8,}$/.test(val)) return val;
            }

            const nested = findDoubaoNestedConversationTitle(item, 5);
            if (nested) return nested;
            return `会话 ${id}`;
        }

        function findDoubaoNestedBadgeCount(obj, maxDepth = 5) {
            if (!obj || typeof obj !== 'object' || maxDepth < 0) return null;

            const direct = Number(obj.badge_count);
            if (Number.isFinite(direct)) return direct;

            if (maxDepth === 0) return null;
            for (const v of Object.values(obj)) {
                if (!v || typeof v !== 'object') continue;
                const found = findDoubaoNestedBadgeCount(v, maxDepth - 1);
                if (Number.isFinite(found)) return found;
            }
            return null;
        }

        function resolveDoubaoConversationBadgeCount(item) {
            const preferredPaths = [
                'badge_count',
                'conversation.badge_count',
                'conversation_info.badge_count',
                'conv.badge_count',
                'coco_conversation.badge_count',
                'chain_info.badge_count'
            ];

            for (const p of preferredPaths) {
                const n = getDoubaoNumberByPath(item, p);
                if (Number.isFinite(n)) return n;
            }

            return findDoubaoNestedBadgeCount(item, 5);
        }

        function findDoubaoNestedTimestamp(obj, keys, maxDepth = 6) {
            if (!obj || typeof obj !== 'object' || maxDepth < 0) return null;

            for (const key of keys) {
                const n = Number(obj[key]);
                if (Number.isFinite(n) && n > 0) return n;
            }

            if (maxDepth === 0) return null;
            for (const v of Object.values(obj)) {
                if (!v || typeof v !== 'object') continue;
                const found = findDoubaoNestedTimestamp(v, keys, maxDepth - 1);
                if (Number.isFinite(found) && found > 0) return found;
            }
            return null;
        }

        function resolveDoubaoConversationTimestamps(item) {
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
                const n = getDoubaoNumberByPath(item, p);
                if (Number.isFinite(n) && n > 0) {
                    createdAt = n;
                    break;
                }
            }
            if (!Number.isFinite(createdAt) || createdAt <= 0) {
                createdAt = findDoubaoNestedTimestamp(item, ['create_time', 'created_at', 'create_timestamp'], 6);
            }

            let updatedAt = null;
            for (const p of updatePaths) {
                const n = getDoubaoNumberByPath(item, p);
                if (Number.isFinite(n) && n > 0) {
                    updatedAt = n;
                    break;
                }
            }
            if (!Number.isFinite(updatedAt) || updatedAt <= 0) {
                updatedAt = findDoubaoNestedTimestamp(item, ['update_time', 'updated_at', 'update_timestamp'], 6);
            }

            return {
                createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : 0,
                updatedAt: Number.isFinite(updatedAt) && updatedAt > 0 ? updatedAt : 0
            };
        }

        function extractDoubaoRecentConversations(respJson) {
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

                const title = resolveDoubaoConversationTitle(item, id);
                const badgeCount = resolveDoubaoConversationBadgeCount(item);
                const ts = resolveDoubaoConversationTimestamps(item);
                const createdAt = ts.createdAt || 0;
                const updatedAt = ts.updatedAt || createdAt || 0;

                seen.add(id);
                out.push({
                    id,
                    title: title || `会话 ${id}`,
                    badgeCount: Number.isFinite(badgeCount) ? badgeCount : null,
                    createdAt,
                    createdAtText: formatDoubaoTime(createdAt),
                    updatedAt,
                    updatedAtText: formatDoubaoTime(updatedAt),
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

        function findDoubaoNestedVersion(obj, keys, maxDepth = 6) {
            if (!obj || typeof obj !== 'object' || maxDepth < 0) return null;

            for (const key of keys) {
                const val = obj[key];
                if (val === 0 || val === '0') return '0';
                if (val != null && String(val).trim()) return String(val).trim();
            }

            if (maxDepth === 0) return null;
            for (const v of Object.values(obj)) {
                if (!v || typeof v !== 'object') continue;
                const found = findDoubaoNestedVersion(v, keys, maxDepth - 1);
                if (found != null && String(found).trim()) return String(found).trim();
            }
            return null;
        }

        function resolveDoubaoNextConvCursor(payload, pageConversations) {
            const payloadCursor = String(
                payload?.next_conv_version
                || payload?.nextConvVersion
                || payload?.next_cursor
                || payload?.nextCursor
                || payload?.cursor
                || payload?.conv_version
                || payload?.conversation_version
                || ''
            ).trim();
            if (payloadCursor) return payloadCursor;

            const arr = Array.isArray(pageConversations) ? pageConversations : [];
            for (let i = arr.length - 1; i >= 0; i--) {
                const raw = arr[i]?.raw;
                const fromRaw = findDoubaoNestedVersion(raw, ['next_conv_version', 'nextConvVersion', 'conv_version', 'conversation_version'], 6);
                if (fromRaw) return fromRaw;
            }

            const oldestTs = arr
                .map((x) => Number(x?.updatedAt || x?.createdAt || 0))
                .filter((n) => Number.isFinite(n) && n > 0)
                .sort((a, b) => a - b)[0];
            if (Number.isFinite(oldestTs) && oldestTs > 0) return String(oldestTs);

            return '';
        }

        function normalizeDoubaoConvVersionValue(cursor) {
            const s = String(cursor == null ? '' : cursor).trim();
            if (!s) return 0;
            if (/^\d+$/.test(s)) {
                const n = Number(s);
                if (Number.isSafeInteger(n)) return n;
                // 超过 JS 安全整数范围时保留字符串，避免分页游标精度丢失导致重复首屏
                return s;
            }
            return s;
        }

        async function fetchDoubaoRecentConversations(customUrl = '', limit = 20) {
            const baseUrl = customUrl || doubaoCapturedRecentConvUrl || `${window.location.origin}/im/chain/recent_conv`;
            const keepOriginalQuery = Boolean(customUrl && customUrl.trim());
            const headers = sanitizeDoubaoHeaders(doubaoCapturedTemplate?.headers || {});
            headers.accept = 'application/json, text/plain, */*';
            const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
            const recentConvTemplateBody = safeParseJson(doubaoCapturedRecentConvBodyText || '');

            const errors = [];
            const candidates = getDoubaoWebTabIdCandidates(baseUrl);

            for (const tabId of candidates) {
                const url = ensureDoubaoRecentConvUrl(baseUrl, tabId, keepOriginalQuery);

                const postHeaders = {
                    ...headers,
                    'content-type': 'application/json; encoding=utf-8',
                    'agw-js-conv': 'str'
                };

                try {
                    const merged = [];
                    const seen = new Set();
                    let rawText = '';
                    let firstJson = null;
                    let page = 0;
                    let convVersionCursor = 0;
                    let keepPaging = true;
                    let lastCursorUsed = '';

                    while (keepPaging && merged.length < safeLimit && page < 12) {
                        if (page > 0) {
                            await preflightDoubaoMcsList();
                        }
                        const remaining = Math.max(1, safeLimit - merged.length);
                        const requestLimit = Math.min(20, remaining);
                        const isContinuationPage = page > 0;
                        const buildMainBody = (mode) => {
                            const body = (mode === 'template' && recentConvTemplateBody && typeof recentConvTemplateBody === 'object')
                                ? JSON.parse(JSON.stringify(recentConvTemplateBody))
                                : {
                                    cmd: 3200,
                                    uplink_body: {
                                        pull_recent_conv_chain_uplink_body: {
                                            limit: requestLimit,
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
                                    sequence_id: genUuid(),
                                    channel: 2,
                                    version: '1'
                                };

                            if (!body.uplink_body || typeof body.uplink_body !== 'object') {
                                body.uplink_body = {};
                            }
                            if (!body.uplink_body.pull_recent_conv_chain_uplink_body || typeof body.uplink_body.pull_recent_conv_chain_uplink_body !== 'object') {
                                body.uplink_body.pull_recent_conv_chain_uplink_body = {};
                            }

                            const pullBody = body.uplink_body.pull_recent_conv_chain_uplink_body;
                            if (!pullBody.option || typeof pullBody.option !== 'object') {
                                pullBody.option = {};
                            }

                            pullBody.limit = requestLimit;
                            pullBody.conv_version = normalizeDoubaoConvVersionValue(convVersionCursor);
                            if (pullBody.api_version == null) pullBody.api_version = 1;
                            pullBody.direction = isContinuationPage ? 1 : (pullBody.direction == null ? 3 : pullBody.direction);
                            if (pullBody.message_count_per_conv == null) pullBody.message_count_per_conv = 10;

                            // 对齐豆包官方分页行为：第二页开始切换续页参数，避免重复首屏 20 条。
                            if (isContinuationPage) {
                                pullBody.option.need_coco_conversation = false;
                                pullBody.option.need_coco_bot = false;
                                pullBody.option.need_pc_pin_chain = true;
                                pullBody.option.pc_pin_query_type = 1;
                            } else {
                                if (pullBody.option.need_coco_conversation == null) pullBody.option.need_coco_conversation = true;
                                if (pullBody.option.need_coco_bot == null) pullBody.option.need_coco_bot = true;
                                if (pullBody.option.need_pc_pin_chain == null) pullBody.option.need_pc_pin_chain = true;
                                if (pullBody.option.pc_pin_query_type == null) pullBody.option.pc_pin_query_type = 0;
                            }

                            body.cmd = Number(body.cmd || 3200) || 3200;
                            body.sequence_id = genUuid();
                            if (body.channel == null) body.channel = 2;
                            if (body.version == null) body.version = '1';
                            return body;
                        };

                        const requestModes = recentConvTemplateBody && typeof recentConvTemplateBody === 'object'
                            ? ['template', 'fallback']
                            : ['fallback'];

                        let json = null;
                        let lastReqError = '';
                        for (const mode of requestModes) {
                            const postBody = buildMainBody(mode);
                            const resp = await fetch(url, {
                                method: 'POST',
                                credentials: 'include',
                                headers: postHeaders,
                                body: JSON.stringify(postBody)
                            });

                            const text = await resp.text();
                            const parsed = safeParseJson(text);
                            rawText = text;

                            if (!resp.ok) {
                                lastReqError = `${mode}: HTTP ${resp.status}`;
                                continue;
                            }
                            if (!parsed) {
                                lastReqError = `${mode}: non-json`;
                                continue;
                            }
                            if (Number(parsed.status_code || 0) !== 0) {
                                lastReqError = `${mode}: code=${parsed.status_code}, msg=${parsed.status_desc || 'unknown'}`;
                                continue;
                            }

                            json = parsed;
                            break;
                        }

                        if (!json) {
                            throw new Error(lastReqError || 'request failed');
                        }

                        if (!firstJson) firstJson = json;

                        const pageConversations = extractDoubaoRecentConversations(json);
                        if (!pageConversations.length) {
                            break;
                        }

                        let added = 0;
                        pageConversations.forEach((item) => {
                            const id = String(item?.id || '').trim();
                            if (!id || seen.has(id)) return;
                            seen.add(id);
                            merged.push(item);
                            added += 1;
                        });

                        const payload = json?.downlink_body?.pull_recent_conv_chain_downlink_body
                            || json?.downlink_body?.pull_recent_conv_downlink_body
                            || {};

                        const hasMore = Boolean(payload?.has_more || payload?.hasMore)
                            || pageConversations.length >= requestLimit;

                        const nextConvVersion = resolveDoubaoNextConvCursor(payload, pageConversations);

                        page += 1;
                        if (!hasMore || added === 0) {
                            keepPaging = false;
                        } else {
                            const normalized = String(nextConvVersion || '').trim();
                            const currentCursorText = String(convVersionCursor == null ? '' : convVersionCursor).trim();
                            if (!normalized || normalized === currentCursorText || normalized === lastCursorUsed) {
                                keepPaging = false;
                            } else {
                                lastCursorUsed = currentCursorText;
                                convVersionCursor = normalizeDoubaoConvVersionValue(normalized);
                            }
                        }
                    }

                    if (merged.length) {
                        rememberDoubaoWebTabId(tabId);
                        const finalConversations = merged
                            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                            .slice(0, safeLimit);
                        return {
                            url,
                            rawText,
                            json: firstJson || {},
                            conversations: finalConversations,
                            requested: safeLimit,
                            obtained: finalConversations.length,
                            pages: page
                        };
                    }

                    errors.push(`POST(main) ${tabId}: empty`);
                } catch (e) {
                    errors.push(`POST(main) ${tabId}: ${e.message || String(e)}`);
                }
            }

            throw new Error(`recent_conv 请求失败（已重试 ${candidates.length} 个 web_tab_id）。${errors.slice(0, 4).join(' | ')}`);
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

            // 豆包以外平台不做豆包专属清洗，避免影响 ChatGPT / 千问 的原始导出逻辑。
            if (!isDoubao) return text;

            const normalizeLines = (inputText) => {
                const lines = String(inputText || '')
                    .split(/\r?\n/)
                    .map((x) => String(x || '').trim())
                    .filter(Boolean);

                const out = [];
                const seen = new Set();
                const push = (line) => {
                    const t = String(line || '').trim();
                    if (!t) return;
                    const key = t.replace(/\s+/g, ' ');
                    if (seen.has(key)) return;
                    seen.add(key);
                    out.push(t);
                };

                lines.forEach((line) => {
                    // 原生 entities payload 行，直接跳过，避免“原生响应”污染展示。
                    if (/^\{.*"entities"\s*:\s*\[.*"text"\s*:/i.test(line)) return;
                    if (/^\{.*"entity_content"\s*:\s*\{.*"file"\s*:/i.test(line)) return;

                    // 过滤附件 key / 预览 URL 噪音。
                    if (/^R[A-Za-z0-9]{20,}$/i.test(line)) return;
                    if (/^https?:\/\//i.test(line) && /(byteimg|tos-cn-|flow-sign|flow-imagex-sign)/i.test(line)) return;

                    const parsed = parseDoubaoContentPayload(line);
                    if (parsed && parsed !== line) {
                        parsed
                            .split(/\r?\n/)
                            .map((x) => String(x || '').trim())
                            .filter(Boolean)
                            .forEach(push);
                    } else {
                        push(line);
                    }
                });

                return out.join('\n').trim();
            };

            const parsed = parseDoubaoContentPayload(text);
            const normalized = normalizeLines(parsed || text);
            return normalized || (parsed || text);
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
                const sourceMessageId = String(m?.message_id || m?.msg_id || '').trim();

                if (normalText) {
                    built.push({ role, text: normalText, indexInConv, createTime, subOrder: 0, isArtifact: false, sourceMessageId });
                }
                if (artifactText) {
                    built.push({ role, text: artifactText, indexInConv, createTime, subOrder: 1, isArtifact: true, sourceMessageId });
                }
            }

            const enriched = built
                .sort((a, b) => {
                    if ((a.indexInConv || 0) !== (b.indexInConv || 0)) {
                        return (a.indexInConv || 0) - (b.indexInConv || 0);
                    }
                    if ((a.createTime || 0) !== (b.createTime || 0)) {
                        return (a.createTime || 0) - (b.createTime || 0);
                    }
                    return (a.subOrder || 0) - (b.subOrder || 0);
                })
                .map(({ role, text, isArtifact, sourceMessageId, indexInConv, createTime }) => ({
                    role,
                    text,
                    isArtifact: Boolean(isArtifact),
                    sourceMessageId: String(sourceMessageId || '').trim(),
                    index: Number(indexInConv || 0),
                    createTime: Number(createTime || 0)
                }));

            return enriched;
        };

        getDoubaoMessagesByApi = async function () {
            if (!isDoubao) return [];
            installDoubaoCaptureHooks();

            const convId = getDoubaoConversationIdFromUrl();
            if (!convId) return [];

            try {
                const allRes = await fetchDoubaoAllConversationMessages(convId, DOUBAO_FULL_FETCH_MAX_PAGES, () => {});
                if (Array.isArray(allRes?.messages) && allRes.messages.length) {
                    return allRes.messages;
                }
            } catch (e) {
                console.warn('AI-Chat-Helper: 豆包全量分页获取失败，回退单页请求', e);
            }

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
                    console.warn(`AI-Chat-Helper: 豆包会话 API 请求失败 (${resp.status}, mode=${mode})`);
                    return [];
                }

                const rawText = await resp.text();
                const json = safeParseJson(rawText);
                if (!json) {
                    const mode = req.fromTemplate ? 'template' : 'fallback';
                    console.warn(`AI-Chat-Helper: 豆包会话 API 返回非 JSON 响应 (mode=${mode})`);
                    return [];
                }
                const parsed = await parseDoubaoSingleChainMessages(json, req.headers);
                if (parsed.length) return parsed;
                if (Number(json?.status_code) !== 0) {
                    const mode = req.fromTemplate ? 'template' : 'fallback';
                    console.warn(`AI-Chat-Helper: 豆包会话 API 返回异常 status_code=${json?.status_code || 'unknown'} (mode=${mode})`);
                } else {
                    const mode = req.fromTemplate ? 'template' : 'fallback';
                    console.warn(`AI-Chat-Helper: 豆包会话 API 成功但未解析到消息 (mode=${mode})`);
                }
                return [];
            } catch (e) {
                console.warn('AI-Chat-Helper: 豆包会话 API 解析失败', e);
                return [];
            }
        };

        async function fetchDoubaoConversationMessagesByApi(convId, msgCursor = '', anchorIndex = null) {
            const req = buildDoubaoRequest(convId);
            const pullBody = req?.bodyText ? safeParseJson(req.bodyText) : null;
            const bodyObj = pullBody && typeof pullBody === 'object' ? pullBody : {
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

            if (!bodyObj.uplink_body || typeof bodyObj.uplink_body !== 'object') {
                bodyObj.uplink_body = {};
            }
            if (!bodyObj.uplink_body.pull_singe_chain_uplink_body || typeof bodyObj.uplink_body.pull_singe_chain_uplink_body !== 'object') {
                bodyObj.uplink_body.pull_singe_chain_uplink_body = {};
            }

            const pull = bodyObj.uplink_body.pull_singe_chain_uplink_body;
            pull.conversation_id = convId;
            pull.limit = Number(pull.limit || 50) || 50;
            pull.direction = 1;
            if (msgCursor) pull.msg_cursor = String(msgCursor);
            else if ('msg_cursor' in pull) delete pull.msg_cursor;
            if (anchorIndex != null && Number.isFinite(Number(anchorIndex))) {
                pull.anchor_index = Number(anchorIndex);
            } else {
                pull.anchor_index = Number.MAX_SAFE_INTEGER;
            }

            bodyObj.sequence_id = genUuid();

            const resp = await fetch(req.url, {
                method: 'POST',
                credentials: 'include',
                headers: req.headers,
                body: JSON.stringify(bodyObj)
            });

            const rawText = await resp.text();
            const json = safeParseJson(rawText);
            if (!resp.ok) {
                throw new Error(`chain/single HTTP ${resp.status}`);
            }
            if (!json) {
                throw new Error('chain/single 返回非 JSON');
            }
            if (Number(json.status_code || 0) !== 0) {
                throw new Error(`chain/single status_code=${json.status_code}, msg=${json.status_desc || 'unknown'}`);
            }

            const payload = json?.downlink_body?.pull_singe_chain_downlink_body || {};
            const parsed = await parseDoubaoSingleChainMessages(json, req.headers);
            const nextIndexNum = Number(payload.next_index);
            const hasValidNextIndex = Number.isFinite(nextIndexNum) && nextIndexNum > 0;
            const indexes = parsed
                .map((m) => Number(m?.index || 0))
                .filter((v) => Number.isFinite(v) && v > 0);
            const minIndex = indexes.length ? Math.min(...indexes) : 0;

            return {
                parsed,
                hasMore: parseBoolLike(payload.has_more ?? payload.hasMore),
                nextCursor: String(payload.msg_cursor || ''),
                nextIndex: hasValidNextIndex ? nextIndexNum : 0,
                minIndex,
                rawText
            };
        }

        async function fetchDoubaoAllConversationMessages(convId, maxPages = 30, onProgress = () => {}) {
            let cursor = '';
            let anchorIndex = null;
            let page = 0;
            let done = false;
            const all = [];
            const seen = new Set();
            let lastPageSignature = '';

            while (!done && page < maxPages) {
                page += 1;
                const res = await fetchDoubaoConversationMessagesByApi(convId, cursor, anchorIndex);
                const parsed = Array.isArray(res?.parsed) ? res.parsed : [];

                parsed.forEach((m) => {
                    const idKey = String(
                        m.sourceMessageId
                        || m.id
                        || `${m.role}_${Number(m.index || 0)}_${Boolean(m.isArtifact) ? 'a' : 'n'}_${(m.text || '').slice(0, 48)}`
                    );
                    if (seen.has(idKey)) return;
                    seen.add(idKey);
                    all.push(m);
                });

                onProgress({
                    page,
                    count: all.length,
                    hasMore: Boolean(res.hasMore),
                    cursor: res.nextCursor,
                    nextIndex: res.nextIndex,
                    minIndex: res.minIndex
                });

                if (!res.hasMore) {
                    done = true;
                    continue;
                }

                if (parsed.length > 0) {
                    const firstId = String(parsed[0]?.sourceMessageId || parsed[0]?.id || '').trim();
                    const lastId = String(parsed[parsed.length - 1]?.sourceMessageId || parsed[parsed.length - 1]?.id || '').trim();
                    const pageSignature = `${firstId}|${lastId}|${parsed.length}`;
                    if (pageSignature && pageSignature === lastPageSignature) {
                        done = true;
                        continue;
                    }
                    lastPageSignature = pageSignature;
                }

                const nextCursor = String(res.nextCursor || '').trim();
                const nextIndex = Number(res.nextIndex || 0);
                const hasValidNextIndex = Number.isFinite(nextIndex) && nextIndex > 0;
                const minIndex = Number(res.minIndex || 0);
                const computedNextAnchor = minIndex > 1 ? (minIndex - 1) : 0;

                if (nextCursor) {
                    if (nextCursor !== cursor) {
                        cursor = nextCursor;
                        if (hasValidNextIndex) anchorIndex = nextIndex;
                        continue;
                    }
                    if (hasValidNextIndex && nextIndex !== Number(anchorIndex)) {
                        anchorIndex = nextIndex;
                        cursor = '';
                        continue;
                    }
                    if (computedNextAnchor > 0 && computedNextAnchor !== Number(anchorIndex)) {
                        anchorIndex = computedNextAnchor;
                        cursor = '';
                        continue;
                    }
                    done = true;
                } else {
                    if (hasValidNextIndex && nextIndex !== Number(anchorIndex)) {
                        anchorIndex = nextIndex;
                        continue;
                    }
                    if (computedNextAnchor > 0 && computedNextAnchor !== Number(anchorIndex)) {
                        anchorIndex = computedNextAnchor;
                        continue;
                    }
                    done = true;
                }
            }

            const sorted = all.sort((a, b) => {
                const ai = Number(a?.index || 0);
                const bi = Number(b?.index || 0);
                if (ai !== bi) return ai - bi;
                const at = Number(a?.createTime || 0);
                const bt = Number(b?.createTime || 0);
                if (at !== bt) return at - bt;
                return 0;
            });

            return {
                messages: sorted,
                pages: page
            };
        }

        async function exportDoubaoBatchConversations(conversations, format) {
            await exportBatchConversationsAsZip('豆包', conversations, format, '豆包');
        }

        async function exportQwenBatchConversations(conversations, format) {
            await exportBatchConversationsAsZip('千问', conversations, format, '千问');
        }

        async function exportDeepSeekBatchConversations(conversations, format) {
            await exportBatchConversationsAsZip('DeepSeek', conversations, format, 'DeepSeek');
        }

        function getBatchConversationListStyles(listSelector) {
            return `
                    .db-batch-scroll::-webkit-scrollbar,
                    ${listSelector}::-webkit-scrollbar { width: 8px; height: 8px; }
                    .db-batch-scroll::-webkit-scrollbar-track,
                    ${listSelector}::-webkit-scrollbar-track { background: transparent; }
                    .db-batch-scroll::-webkit-scrollbar-thumb,
                    ${listSelector}::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 999px; }
                    .db-batch-scroll::-webkit-scrollbar-thumb:hover,
                    ${listSelector}::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
                    .db-batch-loading { display:flex; align-items:center; justify-content:center; flex-direction:column; gap:10px; padding:28px 12px; color:#64748b; font-size:12px; }
                    .db-batch-spinner { width:22px; height:22px; border-radius:999px; border:2px solid #cbd5e1; border-top-color:#2563eb; animation: db-batch-spin 0.9s linear infinite; }
                    @keyframes db-batch-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                    .db-batch-item { position:relative; display:block; padding:10px 12px; border-bottom:1px solid #f1f5f9; background:#fff; overflow:hidden; }
                    .db-batch-content { position:relative; z-index:1; display:grid; grid-template-columns:auto minmax(0, 1fr) 56px 38px; column-gap:10px; align-items:start; width:100%; pointer-events:none; }
                    .db-batch-left-slot { display:grid; place-items:start center; align-content:start; padding-top:2px; }
                    .db-batch-hit-layer { position:absolute; inset:0; z-index:2; display:grid; grid-template-columns:minmax(0, 1fr) minmax(0, 1fr); }
                    .db-batch-hit-left,
                    .db-batch-hit-right { border:none; background:transparent; padding:0; margin:0; cursor:pointer; transition:background .18s ease, box-shadow .18s ease; }
                    .db-batch-hit-right { position:relative; display:flex; align-items:center; justify-content:flex-end; padding-right:10px; }
                    .db-batch-hit-left:hover { background:linear-gradient(90deg, rgba(16,185,129,.10), rgba(16,185,129,.03)); }
                    .db-batch-hit-right:hover { background:linear-gradient(90deg, rgba(37,99,235,.03), rgba(37,99,235,.10)); }
                    .db-batch-hit-left:focus-visible,
                    .db-batch-hit-right:focus-visible { outline:none; box-shadow:inset 0 0 0 2px rgba(37,99,235,.22); }
                    .db-batch-ck { appearance:none; -webkit-appearance:none; width:16px; height:16px; border:1.5px solid #94a3b8; border-radius:4px; margin-top:2px; background:#fff; position:relative; flex-shrink:0; display:grid; place-items:center; accent-color:#2563eb; }
                    .db-batch-ck:checked { border-color:#2563eb; background:#2563eb; }
                    .db-batch-ck:checked::after { content:''; position:absolute; left:50%; top:50%; width:5px; height:9px; border:solid #fff; border-width:0 2px 2px 0; transform:translate(-50%, -58%) rotate(45deg); }
                    .db-batch-main { min-width:0; }
                    .db-batch-title { font-size:12px; color:#0f172a; line-height:1.5; font-weight:600; margin:0; }
                    .db-batch-meta { display:grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap:6px; margin-top:5px; }
                    .db-batch-tag { font-size:11px; color:#475569; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:4px 8px; line-height:1.4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
                    .db-batch-right { width:56px; justify-self:center; align-self:center; display:flex; align-items:center; justify-content:center; }
                    .db-batch-preview-slot { width:32px; height:32px; }
                    .db-batch-index { width:48px; min-width:48px; text-align:center; font-size:11px; font-weight:700; color:#1d4ed8; background:#eff6ff; border:1px solid #bfdbfe; border-radius:999px; padding:4px 0; line-height:1.2; white-space:nowrap; box-sizing:border-box; }
                    .db-batch-hit-preview-icon { width:32px; height:32px; border-radius:8px; display:grid; place-items:center; background:transparent; border:1.5px solid rgba(37,99,235,.6); color:#2563eb; transition:transform .18s ease, filter .18s ease, border-color .18s ease; pointer-events:none; }
                    .db-batch-hit-preview-icon svg { width:16px; height:16px; display:block; fill:none; stroke:currentColor; stroke-width:2; stroke-linecap:round; stroke-linejoin:round; opacity:.96; }
                    .db-batch-hit-right:hover .db-batch-hit-preview-icon,
                    .db-batch-hit-right:focus-visible .db-batch-hit-preview-icon { transform:scale(1.08); filter:saturate(1.03); border-color:rgba(37,99,235,1); }
                    .gpt-batch-export-item:hover,
                    .ds-batch-export-item:hover,
                    .db-batch-export-item:hover,
                    .qw-batch-export-item:hover { background:rgba(37,99,235,0.16) !important; box-shadow:inset 0 0 0 1px rgba(37,99,235,0.28); }
                    .gpt-batch-export-item:focus-visible,
                    .ds-batch-export-item:focus-visible,
                    .db-batch-export-item:focus-visible,
                    .qw-batch-export-item:focus-visible { outline:none; box-shadow:inset 0 0 0 2px rgba(37,99,235,0.18); }
                    #gpt-batch-export-menu-trigger:hover,
                    #ds-batch-export-menu-trigger:hover,
                    #db-batch-export-menu-trigger:hover,
                    #qw-batch-export-menu-trigger:hover { background:rgba(37,99,235,0.12) !important; box-shadow:inset 0 0 0 1px rgba(37,99,235,0.26); }
                    .gpt-batch-export-item:first-child, .ds-batch-export-item:first-child, .db-batch-export-item:first-child, .qw-batch-export-item:first-child { border-top-left-radius:8px !important; border-top-right-radius:8px !important; }
                    .gpt-batch-export-item:last-child, .ds-batch-export-item:last-child, .db-batch-export-item:last-child, .qw-batch-export-item:last-child { border-bottom-left-radius:8px !important; border-bottom-right-radius:8px !important; }
                    .gpt-batch-export-item + .gpt-batch-export-item,
                    .ds-batch-export-item + .ds-batch-export-item,
                    .db-batch-export-item + .db-batch-export-item,
                    .qw-batch-export-item + .qw-batch-export-item { border-top:1px solid #dbeafe !important; }
                    @media (max-width: 860px) { .db-batch-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
                `;
        }

        function renderBatchConversationList(listEl, conversations, buildMetaTags, emptyText) {
            if (!conversations.length) {
                listEl.innerHTML = `<div style="padding:14px;font-size:12px;color:#64748b;">${escapeHtml(emptyText || '未获取到历史会话，请稍后重试。')}</div>`;
                return;
            }

            listEl.innerHTML = conversations.map((conversation, idx) => {
                const metaTags = (typeof buildMetaTags === 'function' ? buildMetaTags(conversation) : [])
                    .filter(Boolean)
                    .map((text) => `<span class="db-batch-tag">${escapeHtml(String(text))}</span>`)
                    .join('');
                const rowKey = escapeHtml(String(conversation.key || conversation.id || idx));
                return `
                    <div class="db-batch-item" data-key="${rowKey}">
                        <div class="db-batch-content">
                            <div class="db-batch-left-slot">
                                <input type="checkbox" class="db-batch-ck" data-key="${rowKey}" data-id="${escapeHtml(conversation.id)}" checked>
                            </div>
                            <div class="db-batch-main">
                                <p class="db-batch-title">${escapeHtml(conversation.title || `会话 ${conversation.id}`)}</p>
                                <div class="db-batch-meta">${metaTags}</div>
                            </div>
                            <div class="db-batch-right">
                                <span class="db-batch-index">#${idx + 1}</span>
                            </div>
                            <div class="db-batch-preview-slot" aria-hidden="true"></div>
                        </div>
                        <div class="db-batch-hit-layer">
                            <button type="button" class="db-batch-hit-left" data-key="${rowKey}" title="选中/取消选中"></button>
                            <button type="button" class="db-batch-hit-right" data-key="${rowKey}" title="查看该对话消息">
                                <span class="db-batch-hit-preview-icon" aria-hidden="true">
                                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                </span>
                            </button>
                        </div>
                    </div>
                `;
            }).join('');
        }

        function buildUnifiedBatchMetaTags(conversation, options = {}) {
            const conv = conversation || {};
            const idLabel = String(options.idLabel || '会话ID');
            const idValue = String(conv.id || conv.conversationId || '-');
            const messageCountRaw = conv.badgeCount != null ? conv.badgeCount : conv.messageCount;
            const messageCount = Number(messageCountRaw);
            const messageCountText = Number.isFinite(messageCount) ? String(messageCount) : '-';
            const updatedAtText = String(conv.updatedAtText || '-');
            const createdAtText = String(conv.createdAtText || '-');

            return [
                `${idLabel}: ${idValue || '-'}`,
                `消息数: ${messageCountText}`,
                `更新时间: ${updatedAtText || '-'}`,
                `创建时间: ${createdAtText || '-'}`
            ];
        }

        async function hydrateConversationMessageCounts(conversations, options = {}) {
            const list = Array.isArray(conversations) ? conversations : [];
            const getCount = typeof options.getCount === 'function' ? options.getCount : null;
            const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
            const isCancelled = typeof options.isCancelled === 'function' ? options.isCancelled : null;
            const shouldHydrate = typeof options.shouldHydrate === 'function'
                ? options.shouldHydrate
                : ((item) => {
                    const n = Number(item?.badgeCount ?? item?.messageCount);
                    return !Number.isFinite(n) || n < 0;
                });
            const concurrency = Math.max(1, Math.min(6, Number(options.concurrency) || 2));
            if (!getCount || !list.length) return { total: 0, completed: 0, resolved: 0 };

            const targets = list.filter((item) => {
                try {
                    return Boolean(shouldHydrate(item));
                } catch (e) {
                    return false;
                }
            });
            const total = targets.length;
            if (!total) return { total: 0, completed: 0, resolved: 0 };

            let cursor = 0;
            let completed = 0;
            let resolved = 0;

            const worker = async () => {
                while (cursor < total) {
                    if (isCancelled && isCancelled()) break;
                    const idx = cursor;
                    cursor += 1;
                    const conv = targets[idx];
                    try {
                        const countRaw = await getCount(conv);
                        const count = Number(countRaw);
                        if (Number.isFinite(count) && count >= 0) {
                            conv.badgeCount = count;
                            conv.messageCount = count;
                            resolved += 1;
                        }
                    } catch (e) {
                        // ignore single-conversation count failure
                    } finally {
                        completed += 1;
                        if (onProgress) {
                            onProgress({ total, completed, resolved, conversation: conv });
                        }
                    }
                }
            };

            await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
            return { total, completed, resolved };
        }

        function normalizeExportSourceLabel(raw) {
            const s = String(raw || 'DOM').toUpperCase();
            if (s.includes('API')) return 'API';
            return 'DOM';
        }

        function renderDeepSeekSessionPanel(meta) {
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
        }

        function getUnifiedModalMotion() {
            const reduceMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
            return {
                reduceMotion,
                overlayTransition: reduceMotion ? 'opacity 0.01s linear' : 'opacity 0.24s cubic-bezier(0.22,0.61,0.36,1)',
                modalTransition: reduceMotion
                    ? 'opacity 0.01s linear, transform 0.01s linear'
                    : 'opacity 0.26s cubic-bezier(0.22,0.61,0.36,1), transform 0.26s cubic-bezier(0.22,0.61,0.36,1)',
                enterTransform: 'translateY(14px) scale(0.98)',
                exitTransform: 'translateY(10px) scale(0.985)',
                exitDurationMs: reduceMotion ? 20 : 230
            };
        }

        const activeModalCloseStack = [];

        function setupUnifiedModalLifecycle(overlay, modal, options = {}) {
            if (!overlay || !modal) return { close: () => {}, isClosing: () => true, motion: getUnifiedModalMotion() };
            const motion = getUnifiedModalMotion();
            const onBeforeClose = typeof options.onBeforeClose === 'function' ? options.onBeforeClose : null;
            const closeOnOverlay = options.closeOnOverlay !== false;
            const enableEsc = options.enableEsc !== false;

            overlay.style.opacity = '0';
            overlay.style.transition = motion.overlayTransition;
            modal.style.opacity = '0';
            modal.style.transform = motion.enterTransform;
            modal.style.transition = motion.modalTransition;

            let closing = false;
            let cleanupTimer = 0;

            const onKeydown = (e) => {
                if (e.key !== 'Escape') return;
                if (activeModalCloseStack[activeModalCloseStack.length - 1] !== close) return;
                e.preventDefault();
                close();
            };

            const cleanup = () => {
                if (cleanupTimer) {
                    clearTimeout(cleanupTimer);
                    cleanupTimer = 0;
                }
                const stackIdx = activeModalCloseStack.lastIndexOf(close);
                if (stackIdx >= 0) activeModalCloseStack.splice(stackIdx, 1);
                if (enableEsc) document.removeEventListener('keydown', onKeydown, true);
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
            };

            const close = () => {
                if (closing) return;
                closing = true;
                if (onBeforeClose) {
                    try {
                        onBeforeClose();
                    } catch (e) {
                        console.warn('AI-Chat-Helper: 模态框关闭前回调失败', e);
                    }
                }
                overlay.style.pointerEvents = 'none';
                overlay.style.opacity = '0';
                modal.style.opacity = '0';
                modal.style.transform = motion.exitTransform;
                cleanupTimer = setTimeout(cleanup, motion.exitDurationMs);
            };

            if (closeOnOverlay) {
                overlay.addEventListener('click', (e) => {
                    if (e.target === overlay) close();
                });
            }
            if (enableEsc) document.addEventListener('keydown', onKeydown, true);
            activeModalCloseStack.push(close);

            requestAnimationFrame(() => {
                if (closing || !overlay.parentNode) return;
                overlay.style.opacity = '1';
                modal.style.opacity = '1';
                modal.style.transform = 'translateY(0) scale(1)';
            });

            return {
                close,
                isClosing: () => closing,
                motion
            };
        }

        async function openMessagePreviewExportModal(options = {}) {
            const headerTitle = String(options.headerTitle || '导出当前对话');
            const loadingTitle = String(options.loadingTitle || '正在加载对话内容...');
            const loadingHint = String(options.loadingHint || '请稍候，导出列表即将就绪');
            const emptyText = String(options.emptyText || '未检测到可导出的内容');
            const headerMetaText = String(options.headerMetaText || '').trim();
            const loader = typeof options.loader === 'function' ? options.loader : null;
            const initialSelectedIndices = Array.isArray(options.initialSelectedIndices) ? options.initialSelectedIndices : null;
            const onSelectionChange = typeof options.onSelectionChange === 'function' ? options.onSelectionChange : null;
            if (!loader) return;

            const renderHeader = (sourceLabel) => `
                <div style="padding:20px 24px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
                    <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                        <h3 style="margin:0;font-size:18px;white-space:nowrap;">${escapeHtml(headerTitle)}</h3>
                        ${headerMetaText ? `<span style="font-size:12px;padding:4px 8px;border-radius:999px;background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(headerMetaText)}</span>` : ''}
                    </div>
                    <button id="modal-x" aria-label="关闭" title="关闭" style="cursor:pointer;border:none;background:#e5e7eb;color:#1f2937;width:32px;height:32px;border-radius:999px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;transition:background .2s ease;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                </div>
            `;

            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:1000003;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:40px;';

            const modal = document.createElement('div');
            modal.style.cssText = 'background:#fff;width:100%;max-width:850px;height:85vh;border-radius:20px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 15px 45px rgba(0,0,0,0.3);';

            let persistSelection = () => {};

            modal.innerHTML = `
                ${renderHeader('检测中...')}
                <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;color:#4b5563;">
                    <div class="m-loading-spinner" style="width:34px;height:34px;border:3px solid #e5e7eb;border-top-color:#1E88E5;border-radius:50%;animation:m-spin 0.9s linear infinite;"></div>
                    <div style="font-size:14px;font-weight:600;">${escapeHtml(loadingTitle)}</div>
                    <div style="font-size:12px;color:#9ca3af;">${escapeHtml(loadingHint)}</div>
                </div>
                <style>
                    @keyframes m-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                </style>
            `;

            document.body.appendChild(overlay);
            overlay.appendChild(modal);
            const modalLifecycle = setupUnifiedModalLifecycle(overlay, modal, {
                onBeforeClose: () => persistSelection()
            });
            const closeModal = modalLifecycle.close;
            modal.querySelector('#modal-x').onclick = closeModal;

            let allMsgs = [];
            let sourceLabel = 'DOM';
            let deepseekMeta = null;
            try {
                const result = await loader();
                allMsgs = Array.isArray(result) ? result : (result?.messages || []);
                const rawSource = Array.isArray(result) ? 'DOM' : (result?.source || 'DOM');
                sourceLabel = normalizeExportSourceLabel(rawSource);
                deepseekMeta = result?.deepseekMeta || null;
            } catch (e) {
                console.warn('AI-Chat-Helper: 获取导出消息失败', e);
            }

            if (modalLifecycle.isClosing() || !overlay.parentNode) return;

            if (!allMsgs.length) {
                modal.innerHTML = `
                    ${renderHeader(sourceLabel)}
                    <div style="flex:1;display:flex;align-items:center;justify-content:center;color:#6b7280;font-size:14px;">${escapeHtml(emptyText)}</div>
                `;
                modal.querySelector('#modal-x').onclick = closeModal;
                return;
            }

            const selectedIndexSet = new Set(
                normalizeMessageSelectionIndices(initialSelectedIndices, allMsgs.length)
                || buildDefaultMessageSelection(allMsgs.length)
            );

            modal.innerHTML = `
                ${renderHeader(sourceLabel)}
                <div style="padding:10px 24px;background:#f8f9fa;border-bottom:1px solid #eee;display:flex;gap:12px;align-items:center;">
                    <button class="m-util-btn" id="m-toggle-all">全不选</button>
                    <button class="m-util-btn" id="m-ans" style="background:#e7f3ff;color:#0d6efd;">仅选回答</button>
                    ${isDeepSeek ? '<button class="m-util-btn" id="m-no-thought" style="background:#fff7e6;color:#d46b08;border-color:#ffd591;">排除思考过程</button>' : ''}
                    <div style="flex:1"></div>
                    <span style="font-size:12px;color:#666;">已选 <b id="m-count-view">${selectedIndexSet.size}</b> 条</span>
                    <div style="position:relative;display:flex;align-items:center;">
                        <button id="m-export-menu-trigger" style="border:1px solid #2563eb;background:#fff;color:#2563eb;border-radius:8px;font-size:12px;padding:7px 12px;cursor:pointer;font-weight:700;display:flex;align-items:center;gap:6px;">
                            <span>导出</span><span id="m-export-menu-icon" style="opacity:.9;display:inline-flex;transition:transform .2s ease;transform:rotate(0deg);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span>
                        </button>
                        <div id="m-export-menu" style="position:absolute;right:0;top:36px;width:100px;background:rgba(255, 255, 255, 0.2);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.35);border-radius:10px;box-shadow:0 10px 30px rgba(15,23,42,.15);padding:0;z-index:7;opacity:0;pointer-events:none;transform:translateY(-8px) scale(0.96);transition:opacity .22s cubic-bezier(0.22,0.61,0.36,1), transform .22s cubic-bezier(0.22,0.61,0.36,1);">
                            <button class="m-export-item" data-f="md" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">Markdown</button>
                            <button class="m-export-item" data-f="pdf" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">PDF</button>
                            <button class="m-export-item" data-f="txt" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">TXT</button>
                            <button class="m-export-item" data-f="csv" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">CSV</button>
                            <button class="m-export-item" data-f="json" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">JSON</button>
                        </div>
                    </div>
                </div>
                ${renderDeepSeekSessionPanel(deepseekMeta)}
                <div id="m-list-box" style="flex:1;overflow-y:auto;padding:10px 24px;"></div>
                <style>
                    .m-util-btn { cursor:pointer;padding:6px 12px;border:1px solid #ddd;border-radius:8px;background:#fff;font-size:12px; }
                    #m-export-menu-trigger:hover { background:rgba(37,99,235,0.12) !important; box-shadow:inset 0 0 0 1px rgba(37,99,235,0.26); }
                    #ai-nodes-node-settings-trigger:hover { background:rgba(37,99,235,0.1) !important; border-color:#93c5fd !important; box-shadow:inset 0 0 0 1px rgba(37,99,235,0.2); }
                    #ai-nodes-node-settings-trigger:focus-visible { outline:none; box-shadow:0 0 0 2px rgba(37,99,235,0.2); }
                    #ai-nodes-reading-line-trigger:hover { background:rgba(37,99,235,0.1) !important; border-color:#93c5fd !important; box-shadow:inset 0 0 0 1px rgba(37,99,235,0.2); }
                    #ai-nodes-reading-line-trigger:focus-visible { outline:none; box-shadow:0 0 0 2px rgba(37,99,235,0.2); }
                    .m-export-item:hover { background:rgba(37,99,235,0.16) !important; box-shadow:inset 0 0 0 1px rgba(37,99,235,0.28); }
                    .m-export-item:focus-visible { outline:none; box-shadow:inset 0 0 0 2px rgba(37,99,235,0.18); }
                    .m-export-item:first-child { border-top-left-radius:8px !important; border-top-right-radius:8px !important; }
                    .m-export-item:last-child { border-bottom-left-radius:8px !important; border-bottom-right-radius:8px !important; }
                    .m-export-item + .m-export-item { border-top:1px solid #dbeafe !important; }
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

            const getSelectedIndices = () => Array.from(modal.querySelectorAll('.m-row-ck:checked'))
                .map((el) => Number(el.getAttribute('data-i')))
                .filter((n) => Number.isInteger(n) && n >= 0 && n < allMsgs.length)
                .sort((a, b) => a - b);

            persistSelection = () => {
                if (onSelectionChange) onSelectionChange(getSelectedIndices(), allMsgs.slice());
            };

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
                        <input type="checkbox" class="m-row-ck" data-i="${i}" ${selectedIndexSet.has(i) ? 'checked' : ''} style="width:18px;height:18px;cursor:pointer;accent-color:#2563eb;">
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
                subOverlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.4);z-index:1000004;display:flex;align-items:center;justify-content:center;';
                const subModal = document.createElement('div');
                subModal.style.cssText = 'background:#fff;width:80%;max-width:600px;max-height:80vh;border-radius:12px;padding:24px;display:flex;flex-direction:column;box-shadow:0 10px 30px rgba(0,0,0,0.2);';
                subModal.innerHTML = `
                    <div style="display:flex;justify-content:space-between;margin-bottom:15px;align-items:center;"><h4 style="margin:0">${escapeHtml(title)}</h4><button id="sub-x" aria-label="关闭" title="关闭" style="cursor:pointer;border:none;background:#e5e7eb;color:#1f2937;width:32px;height:32px;border-radius:999px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;transition:background .2s ease;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button></div>
                    <div id="sub-body" style="flex:1;overflow-y:auto;font-size:14px;line-height:1.6;color:#333;white-space:pre-wrap;padding-top:10px;border-top:1px solid #eee;"></div>
                `;
                subModal.querySelector('#sub-body').textContent = txt;
                subOverlay.appendChild(subModal);
                document.body.appendChild(subOverlay);
                const subLifecycle = setupUnifiedModalLifecycle(subOverlay, subModal);
                subModal.querySelector('#sub-x').onclick = subLifecycle.close;
            }

            const updateToggleAllButton = () => {
                const allChecked = allMsgs.length > 0 && allMsgs.every((_, i) => {
                    const ck = modal.querySelector(`.m-row-ck[data-i="${i}"]`);
                    return Boolean(ck && ck.checked);
                });
                const btn = modal.querySelector('#m-toggle-all');
                if (!btn) return;
                btn.innerText = allChecked ? '全不选' : '全选';
                if (allChecked) {
                    btn.style.background = '#fff1f2';
                    btn.style.color = '#be123c';
                    btn.style.borderColor = '#fecdd3';
                } else {
                    btn.style.background = '#eff6ff';
                    btn.style.color = '#1d4ed8';
                    btn.style.borderColor = '#93c5fd';
                }
            };

            const upCount = () => {
                modal.querySelector('#m-count-view').innerText = modal.querySelectorAll('.m-row-ck:checked').length;
                updateToggleAllButton();
                persistSelection();
            };
            modal.querySelectorAll('.m-row-ck').forEach(c => c.onchange = upCount);

            const exportMenuTrigger = modal.querySelector('#m-export-menu-trigger');
            const exportMenu = modal.querySelector('#m-export-menu');
            const exportMenuIcon = modal.querySelector('#m-export-menu-icon');

            const hideExportMenu = () => {
                if (!exportMenu) return;
                exportMenu.style.opacity = '0';
                exportMenu.style.pointerEvents = 'none';
                exportMenu.style.transform = 'translateY(-8px) scale(0.96)';
                if (exportMenuIcon) exportMenuIcon.style.transform = 'rotate(0deg)';
            };

            const showExportMenu = () => {
                if (!exportMenu) return;
                exportMenu.style.opacity = '1';
                exportMenu.style.pointerEvents = 'auto';
                exportMenu.style.transform = 'translateY(0) scale(1)';
                if (exportMenuIcon) exportMenuIcon.style.transform = 'rotate(180deg)';
            };

            if (exportMenuTrigger) {
                exportMenuTrigger.onclick = (e) => {
                    e.stopPropagation();
                    if (!exportMenu) return;
                    const visible = exportMenu.style.opacity === '1';
                    if (visible) hideExportMenu();
                    else showExportMenu();
                };
            }

            modal.addEventListener('click', (e) => {
                const target = e.target;
                if (!exportMenu || !exportMenuTrigger) return;
                if (exportMenu.contains(target) || exportMenuTrigger.contains(target)) return;
                hideExportMenu();
            });

            modal.querySelector('#m-toggle-all').onclick = () => {
                const allChecked = allMsgs.length > 0 && allMsgs.every((_, i) => {
                    const ck = modal.querySelector(`.m-row-ck[data-i="${i}"]`);
                    return Boolean(ck && ck.checked);
                });
                modal.querySelectorAll('.m-row-ck').forEach(c => c.checked = !allChecked);
                upCount();
            };
            modal.querySelector('#m-ans').onclick = () => {
                allMsgs.forEach((m, i) => modal.querySelector(`.m-row-ck[data-i="${i}"]`).checked = (m.role === 'assistant'));
                upCount();
            };

            if (isDeepSeek && modal.querySelector('#m-no-thought')) {
                modal.querySelector('#m-no-thought').onclick = () => {
                    allMsgs.forEach((m, i) => {
                        const ck = modal.querySelector(`.m-row-ck[data-i="${i}"]`);
                        const rowText = modal.querySelector(`.m-row-ck[data-i="${i}"]`)?.closest('.m-item-row')?.querySelector('.m-row-text');
                        if (m.isThought) {
                            if (ck) ck.checked = false;
                            return;
                        }
                        if (m.hasThought && m.textWithoutThought) {
                            m.text = String(m.textWithoutThought || '');
                            if (rowText) rowText.textContent = getDisplayTextForExport(m.text);
                        }
                    });
                    upCount();
                };
            }

            updateToggleAllButton();
            hideExportMenu();

            modal.querySelector('#modal-x').onclick = closeModal;

            modal.querySelectorAll('.m-export-item').forEach(b => b.onclick = () => {
                persistSelection();
                hideExportMenu();
                const picked = Array.from(modal.querySelectorAll('.m-row-ck:checked')).map(c => allMsgs[parseInt(c.getAttribute('data-i'))]);
                if (!picked.length) return alert('请至少选择一项');
                handleExport(picked, b.getAttribute('data-f'));
            });
        }

        function openBatchConversationPreviewModal(platformLabel, conversationTitle, loader) {
            return openMessagePreviewExportModal({
                headerTitle: '查看对话消息',
                headerMetaText: `${platformLabel} · ${conversationTitle || '未命名会话'}`,
                loadingTitle: '正在加载对话消息...',
                loadingHint: '请稍候，预览和导出列表即将就绪',
                emptyText: '该会话暂无可预览的消息内容。',
                initialSelectedIndices: loader?.initialSelectedIndices || null,
                onSelectionChange: loader?.onSelectionChange || null,
                loader: async () => {
                    const result = await loader();
                    return {
                        messages: Array.isArray(result?.messages) ? result.messages : [],
                        source: result?.source || 'API',
                        deepseekMeta: result?.deepseekMeta || null
                    };
                }
            });
        }

        function bindBatchConversationListInteractions(listEl, lookupConversation, onView, onSelectionChange) {
            listEl.addEventListener('click', async (e) => {
                const selectHit = e.target.closest('.db-batch-hit-left');
                if (selectHit && listEl.contains(selectHit)) {
                    e.preventDefault();
                    const key = selectHit.getAttribute('data-key');
                    const checkbox = listEl.querySelector(`.db-batch-ck[data-key="${CSS.escape(key)}"]`);
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        if (typeof onSelectionChange === 'function') onSelectionChange();
                    }
                    return;
                }

                const viewHit = e.target.closest('.db-batch-hit-right');
                if (viewHit && listEl.contains(viewHit)) {
                    e.preventDefault();
                    const key = viewHit.getAttribute('data-key');
                    const conversation = typeof lookupConversation === 'function' ? lookupConversation(key) : null;
                    if (conversation && typeof onView === 'function') {
                        await onView(conversation);
                    }
                }
            });

            listEl.addEventListener('change', (e) => {
                if (e.target && e.target.classList.contains('db-batch-ck') && typeof onSelectionChange === 'function') {
                    onSelectionChange();
                }
            });
        }

        function normalizeMessageSelectionIndices(indices, totalCount) {
            if (!Array.isArray(indices)) return null;
            const max = Math.max(0, Number(totalCount) || 0);
            const uniq = Array.from(new Set(
                indices
                    .map((n) => Number(n))
                    .filter((n) => Number.isInteger(n) && n >= 0 && n < max)
            )).sort((a, b) => a - b);
            return uniq;
        }

        function buildDefaultMessageSelection(totalCount) {
            const count = Math.max(0, Number(totalCount) || 0);
            return Array.from({ length: count }, (_, i) => i);
        }

        function applyMessageSelection(messages, indices) {
            const list = Array.isArray(messages) ? messages : [];
            const normalized = normalizeMessageSelectionIndices(indices, list.length);
            if (normalized === null) return list.slice();
            return normalized.map((i) => list[i]).filter((item) => item != null);
        }

        function openChatGPTBatchExportModal() {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;z-index:1000001;background:rgba(2,6,23,0.55);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(3px);';

            const modal = document.createElement('div');
            modal.style.cssText = 'width:min(980px,94vw);height:min(82vh,860px);background:#fff;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.25);';

            modal.innerHTML = `
                <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(180deg,#f8fafc 0%, #ffffff 100%);">
                    <div>
                        <div style="font-size:16px;font-weight:700;color:#0f172a;">ChatGPT 批量导出</div>
                    </div>
                    <button id="gpt-batch-close" aria-label="关闭" title="关闭" style="cursor:pointer;border:none;background:#e5e7eb;color:#1f2937;width:32px;height:32px;border-radius:999px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;transition:background .2s ease;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                </div>
                <div class="db-batch-scroll" style="padding:16px 20px;overflow:auto;background:#f8fafc;">
                    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#fff;">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
                            <div style="font-size:13px;font-weight:700;color:#0f172a;">历史会话</div>
                            <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#475569;">
                                <span>获取数量</span>
                                <input id="gpt-batch-limit" type="text" inputmode="numeric" value="20" style="width:72px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:8px;padding:6px 8px;font-size:12px;background:#fff;color:#0f172a;" />
                            </label>
                        </div>
                        <div id="gpt-batch-status" style="font-size:11px;color:#64748b;margin-top:8px;">正在加载历史会话...</div>
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <button id="gpt-batch-toggle-select" style="border:1px solid #93c5fd;background:#eff6ff;border-radius:8px;font-size:12px;padding:8px 12px;cursor:pointer;color:#1d4ed8;font-weight:600;">全选</button>
                            </div>
                            <div style="position:relative;display:flex;justify-content:flex-end;align-items:center;">
                                <button id="gpt-batch-export-menu-trigger" style="border:1px solid #2563eb;background:#fff;color:#2563eb;border-radius:8px;font-size:12px;padding:7px 12px;cursor:pointer;font-weight:700;display:flex;align-items:center;gap:6px;">
                                    <span>导出</span><span id="gpt-batch-export-menu-icon" style="opacity:.9;display:inline-flex;transition:transform .2s ease;transform:rotate(0deg);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span>
                                </button>
                                <div id="gpt-batch-export-menu" style="position:absolute;right:0;top:36px;width:100px;background:rgba(255, 255, 255, 0.2);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.35);border-radius:10px;box-shadow:0 10px 30px rgba(15,23,42,.15);padding:0;z-index:7;opacity:0;pointer-events:none;transform:translateY(-8px) scale(0.96);transition:opacity .22s cubic-bezier(0.22,0.61,0.36,1), transform .22s cubic-bezier(0.22,0.61,0.36,1);">
                                    <button class="gpt-batch-export-item" data-format="json" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">JSON</button>
                                    <button class="gpt-batch-export-item" data-format="md" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">Markdown</button>
                                    <button class="gpt-batch-export-item" data-format="txt" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">TXT</button>
                                    <button class="gpt-batch-export-item" data-format="csv" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">CSV</button>
                                    <button class="gpt-batch-export-item" data-format="pdf" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">PDF</button>
                                </div>
                            </div>
                        </div>
                        <div id="gpt-batch-list" style="max-height:520px;overflow:auto;border:1px solid #e5e7eb;border-radius:10px;margin-top:12px;background:#fff;"></div>
                    </div>
                </div>
                <style>
                    ${getBatchConversationListStyles('#gpt-batch-list')}
                </style>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            const modalLifecycle = setupUnifiedModalLifecycle(overlay, modal);

            let recentConversations = [];
            const messageSelectionByConversation = new Map();
            let loading = false;
            const listEl = modal.querySelector('#gpt-batch-list');
            const statusEl = modal.querySelector('#gpt-batch-status');
            const limitInput = modal.querySelector('#gpt-batch-limit');
            const toggleSelectBtn = modal.querySelector('#gpt-batch-toggle-select');
            const exportMenuTrigger = modal.querySelector('#gpt-batch-export-menu-trigger');
            const exportMenu = modal.querySelector('#gpt-batch-export-menu');
            const exportMenuIcon = modal.querySelector('#gpt-batch-export-menu-icon');

            const close = modalLifecycle.close;
            const hideExportMenu = () => {
                exportMenu.style.opacity = '0';
                exportMenu.style.pointerEvents = 'none';
                exportMenu.style.transform = 'translateY(-8px) scale(0.96)';
                if (exportMenuIcon) exportMenuIcon.style.transform = 'rotate(0deg)';
            };
            const showExportMenu = () => {
                exportMenu.style.opacity = '1';
                exportMenu.style.pointerEvents = 'auto';
                exportMenu.style.transform = 'translateY(0) scale(1)';
                if (exportMenuIcon) exportMenuIcon.style.transform = 'rotate(180deg)';
            };
            const getRecentLimit = () => {
                const inputRaw = String(limitInput.value || '').trim();
                const onlyNum = inputRaw.replace(/[^\d]/g, '');
                const raw = Number(onlyNum || 20);
                const n = Number.isFinite(raw) ? Math.floor(raw) : 20;
                const safe = Math.max(1, Math.min(500, n || 20));
                limitInput.value = String(safe);
                return safe;
            };
            const areAllSelected = () => {
                const items = Array.from(listEl.querySelectorAll('.db-batch-ck'));
                return items.length ? items.every((ck) => ck.checked) : false;
            };
            const updateSelectToggleButton = () => {
                const allSelected = areAllSelected();
                toggleSelectBtn.textContent = allSelected ? '全不选' : '全选';
                if (allSelected) {
                    toggleSelectBtn.style.borderColor = '#fecaca';
                    toggleSelectBtn.style.background = '#fef2f2';
                    toggleSelectBtn.style.color = '#b91c1c';
                } else {
                    toggleSelectBtn.style.borderColor = '#93c5fd';
                    toggleSelectBtn.style.background = '#eff6ff';
                    toggleSelectBtn.style.color = '#1d4ed8';
                }
            };
            const renderRecentList = () => {
                renderBatchConversationList(
                    listEl,
                    recentConversations,
                    (c) => buildUnifiedBatchMetaTags(c, { idLabel: '会话ID' }),
                    '未获取到历史会话，请稍后重试。'
                );
                updateSelectToggleButton();
            };
            const loadRecentConversations = async () => {
                if (loading) return;
                loading = true;
                const limit = getRecentLimit();
                hideExportMenu();
                listEl.innerHTML = '<div class="db-batch-loading"><div class="db-batch-spinner"></div><div>正在加载历史会话...</div></div>';
                statusEl.textContent = `正在加载历史会话（数量: ${limit}）...`;
                try {
                    const result = await fetchChatGPTRecentConversations(limit, 10);
                    recentConversations = result.conversations;
                    const workspaceIds = detectChatGPTWorkspaceIds();
                    statusEl.textContent = `已加载 ${Number(result?.obtained || recentConversations.length)}/${Number(result?.requested || limit)} 个会话 · 识别到 ${workspaceIds.length} 个团队空间`;
                    renderRecentList();
                } catch (e) {
                    recentConversations = [];
                    statusEl.textContent = '加载历史会话失败';
                    listEl.innerHTML = `<div style="padding:14px;font-size:12px;color:#b91c1c;">加载失败: ${escapeHtml(e.message || String(e))}</div>`;
                } finally {
                    loading = false;
                }
            };
            const getSelectedConversations = () => {
                const map = new Map(recentConversations.map((c) => [c.key, c]));
                return Array.from(listEl.querySelectorAll('.db-batch-ck:checked'))
                    .map((el) => map.get(el.getAttribute('data-key')))
                    .filter(Boolean);
            };
            const getStoredSelection = (conv) => normalizeMessageSelectionIndices(
                messageSelectionByConversation.get(String(conv.key || conv.id)),
                Number.MAX_SAFE_INTEGER
            );
            const storeSelection = (conv, indices) => {
                messageSelectionByConversation.set(String(conv.key || conv.id), Array.isArray(indices) ? indices.slice() : []);
            };

            const openConversationPreview = async (conv) => {
                const previewLoader = async () => {
                    const convData = await fetchChatGPTConversationById(conv.id, conv.workspaceId);
                    const messages = extractChatGPTMessagesFromMapping(convData);
                    return {
                        title: String(convData?.title || conv.title || '').trim() || `会话 ${conv.id}`,
                        messages: messages.map((m) => ({
                            role: m.role,
                            text: String(m.text || '')
                        }))
                    };
                };
                previewLoader.initialSelectedIndices = getStoredSelection(conv);
                previewLoader.onSelectionChange = (indices) => storeSelection(conv, indices);
                openBatchConversationPreviewModal('ChatGPT', conv.title || conv.id, previewLoader);
            };
            const runBatchExport = async (format) => {
                hideExportMenu();
                const selected = getSelectedConversations();
                if (!selected.length) {
                    alert('请先勾选至少一个历史会话');
                    return;
                }

                const out = [];
                let failCount = 0;

                for (let i = 0; i < selected.length; i += 1) {
                    const conv = selected[i];
                    statusEl.textContent = `正在导出第 ${i + 1}/${selected.length} 个会话: ${conv.title || conv.id}`;
                    try {
                        const convData = await fetchChatGPTConversationById(conv.id, conv.workspaceId);
                        const messages = extractChatGPTMessagesFromMapping(convData).map((m) => ({
                            role: m.role,
                            text: String(m.text || '')
                        }));
                        const pickedMessages = applyMessageSelection(messages, getStoredSelection(conv));
                        out.push({
                            conversationId: conv.id,
                            title: String(convData?.title || conv.title || '').trim() || `会话 ${conv.id}`,
                            updatedAt: conv.updatedAt || 0,
                            updatedAtText: conv.updatedAtText || '',
                            createdAt: conv.createdAt || 0,
                            createdAtText: conv.createdAtText || '',
                            messageCount: pickedMessages.length,
                            workspaceId: conv.workspaceId || '',
                            workspaceLabel: conv.workspaceLabel || '',
                            projectId: conv.projectId || '',
                            projectTitle: conv.projectTitle || '',
                            archived: Boolean(conv.archived),
                            messages: pickedMessages
                        });
                    } catch (e) {
                        failCount += 1;
                        console.warn('AI-Chat-Helper: ChatGPT 批量导出会话失败', conv?.id, e);
                    }
                }

                if (!out.length) {
                    alert('无可导出的会话数据');
                    return;
                }

                await exportChatGPTBatchConversations(out, format);
                statusEl.textContent = `批量导出完成，成功 ${out.length} 个会话${failCount ? `，失败 ${failCount} 个` : ''}`;
                alert(`批量导出完成：成功 ${out.length} 个会话${failCount ? `，失败 ${failCount} 个` : ''}。已按会话标题分别打包为 ZIP。${format === 'pdf' ? 'PDF 选项导出为可打印 HTML 压缩包。' : ''}`);
            };

            modal.querySelector('#gpt-batch-close').addEventListener('click', close);
            exportMenuTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (exportMenu.style.opacity === '1') hideExportMenu();
                else showExportMenu();
            });
            modal.addEventListener('click', (e) => {
                const target = e.target;
                if (target !== exportMenu && target !== exportMenuTrigger && !exportMenu.contains(target)) hideExportMenu();
            });
            limitInput.addEventListener('change', () => loadRecentConversations());
            limitInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    loadRecentConversations();
                }
            });
            toggleSelectBtn.addEventListener('click', () => {
                const allSelected = areAllSelected();
                listEl.querySelectorAll('.db-batch-ck').forEach((ck) => { ck.checked = !allSelected; });
                updateSelectToggleButton();
            });
            bindBatchConversationListInteractions(
                listEl,
                (key) => recentConversations.find((c) => c.key === key) || null,
                openConversationPreview,
                updateSelectToggleButton
            );
            modal.querySelectorAll('.gpt-batch-export-item').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    runBatchExport(btn.getAttribute('data-format'));
                });
            });

            loadRecentConversations();
        }

        function findAnyDeepSeek(obj, keys) {
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

        function normalizeDeepSeekBatchTimestamp(raw) {
            if (raw == null || raw === '') return { value: 0, text: '-' };
            const str = String(raw).trim();
            if (!str) return { value: 0, text: '-' };
            if (/^\d+(?:\.\d+)?$/.test(str)) {
                const num = Number(str);
                const intPart = str.split('.')[0] || '';
                const ms = intPart.length <= 10 ? num * 1000 : num;
                const dt = new Date(ms);
                return { value: ms, text: Number.isFinite(dt.getTime()) ? dt.toLocaleString() : str };
            }
            const parsed = Date.parse(str);
            if (Number.isFinite(parsed)) return { value: parsed, text: new Date(parsed).toLocaleString() };
            return { value: 0, text: str };
        }

        function ensureDeepSeekPageListUrl(cursor) {
            const base = deepseekPageListTemplate?.url || `https://chat.deepseek.com${DEEPSEEK_PAGE_LIST_PATH}?lte_cursor.pinned=false`;
            const u = new URL(base, window.location.origin);
            u.pathname = DEEPSEEK_PAGE_LIST_PATH;
            if (!u.searchParams.has('lte_cursor.pinned')) u.searchParams.set('lte_cursor.pinned', 'false');
            if (cursor && typeof cursor === 'object') {
                Object.entries(cursor).forEach(([k, v]) => {
                    if (v == null || v === '') return;
                    const key = String(k).startsWith('lte_cursor.') ? String(k) : `lte_cursor.${String(k)}`;
                    u.searchParams.set(key, String(v));
                });
            }
            return u.toString();
        }

        function pickDeepSeekConversationArray(respJson) {
            const candidates = [
                respJson?.data?.biz_data?.chat_sessions,
                respJson?.data?.biz_data?.session_list,
                respJson?.data?.biz_data?.sessions,
                respJson?.data?.chat_sessions,
                respJson?.data?.list,
                respJson?.data?.sessions,
                respJson?.chat_sessions,
                respJson?.sessions,
                respJson?.list
            ];
            return candidates.find((item) => Array.isArray(item)) || [];
        }

        function extractDeepSeekBatchConversationsFromResponse(respJson) {
            const rawList = pickDeepSeekConversationArray(respJson);
            const out = [];
            const seen = new Set();

            rawList.forEach((item, idx) => {
                const id = String(findAnyDeepSeek(item, [
                    'id', 'chat_session_id', 'chatSessionId', 'session_id', 'sessionId', 'uuid'
                ]) || '').trim();
                if (!id || seen.has(id)) return;
                seen.add(id);

                const title = String(findAnyDeepSeek(item, [
                    'title', 'name', 'session_title', 'sessionTitle', 'topic', 'summary'
                ]) || `会话 ${idx + 1}`).trim();
                const updated = normalizeDeepSeekBatchTimestamp(findAnyDeepSeek(item, [
                    'updated_at', 'update_time', 'modified_at', 'modified_time', 'gmt_modified'
                ]));
                const created = normalizeDeepSeekBatchTimestamp(findAnyDeepSeek(item, [
                    'inserted_at', 'created_at', 'create_time', 'created_time', 'gmt_create'
                ]));
                const messageCountRaw = findAnyDeepSeek(item, ['message_count', 'msg_count', 'badge_count', 'messageCount']);
                const messageCount = Number(messageCountRaw);

                out.push({
                    id,
                    title: title || `会话 ${id}`,
                    updatedAt: updated.value,
                    updatedAtText: updated.text,
                    createdAt: created.value,
                    createdAtText: created.text,
                    pinned: Boolean(findAnyDeepSeek(item, ['pinned'])),
                    messageCount: Number.isFinite(messageCount) ? messageCount : null,
                    raw: item
                });
            });

            return out.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        }

        function getDeepSeekBatchNextCursor(respJson) {
            const candidates = [
                respJson?.data?.biz_data?.next_cursor,
                respJson?.data?.biz_data?.lte_cursor,
                respJson?.data?.next_cursor,
                respJson?.data?.cursor,
                respJson?.next_cursor,
                respJson?.cursor
            ];
            for (const item of candidates) {
                if (!item) continue;
                if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
                    return { value: { value: item }, key: JSON.stringify(item) };
                }
                if (typeof item === 'object') {
                    const normalized = {};
                    Object.entries(item).forEach(([k, v]) => {
                        if (v == null || v === '') return;
                        normalized[String(k)] = v;
                    });
                    if (Object.keys(normalized).length) {
                        return { value: normalized, key: JSON.stringify(normalized) };
                    }
                }
            }
            return { value: null, key: '' };
        }

        async function fetchDeepSeekConversationPage(cursor = null) {
            installDeepSeekCaptureHooks();
            const url = ensureDeepSeekPageListUrl(cursor);
            const headers = sanitizeDeepSeekHeaders({
                ...(deepseekPageListTemplate?.headers || {}),
                ...(deepseekCapturedHeaders || {})
            });
            const resp = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers
            });
            const rawText = await resp.text();
            const json = safeParseDeepSeekJson(rawText);
            if (!resp.ok) throw new Error(`会话列表请求失败: HTTP ${resp.status} ${rawText.slice(0, 300)}`);
            if (!json) throw new Error('会话列表返回非 JSON');
            deepseekPageListTemplate = { url, headers };
            return json;
        }

        async function fetchDeepSeekRecentConversations(limit = 30, maxPages = 8) {
            const merged = [];
            const seen = new Set();
            let cursor = null;
            let cursorKey = '';
            let page = 0;

            while (page < maxPages && merged.length < limit) {
                page += 1;
                const json = await fetchDeepSeekConversationPage(cursor);
                const pageItems = extractDeepSeekBatchConversationsFromResponse(json);
                pageItems.forEach((item) => {
                    if (seen.has(item.id)) return;
                    seen.add(item.id);
                    merged.push(item);
                });
                const next = getDeepSeekBatchNextCursor(json);
                if (!next.value || !pageItems.length || next.key === cursorKey) break;
                cursor = next.value;
                cursorKey = next.key;
            }

            return {
                conversations: merged.slice(0, limit).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
                requested: limit,
                obtained: Math.min(limit, merged.length)
            };
        }

        async function fetchDeepSeekConversationMessages(sessionId) {
            installDeepSeekCaptureHooks();
            const url = createDeepSeekHistoryUrl(sessionId);
            const headers = sanitizeDeepSeekHeaders({
                ...(deepseekCapturedHeaders || {}),
                ...(deepseekPageListTemplate?.headers || {})
            });
            const resp = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers
            });
            const rawText = await resp.text();
            const json = safeParseDeepSeekJson(rawText);
            if (!resp.ok) throw new Error(`消息请求失败: HTTP ${resp.status} ${rawText.slice(0, 300)}`);
            if (!json) throw new Error('消息接口返回非 JSON');

            const messages = aggregateDeepSeekMessagesForExport(parseDeepSeekMessagesFromResponse(json)).map((msg) => ({
                role: msg.role,
                text: String(msg.text || ''),
                isThought: Boolean(msg.isThought),
                fragmentType: String(msg.fragmentType || ''),
                hasThought: Boolean(msg.hasThought),
                textWithoutThought: String(msg.textWithoutThought || msg.text || '')
            }));

            return {
                messages,
                meta: extractDeepSeekSessionMeta(json)
            };
        }

        function openDeepSeekBatchExportModal() {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;z-index:1000001;background:rgba(2,6,23,0.55);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(3px);';

            const modal = document.createElement('div');
            modal.style.cssText = 'width:min(980px,94vw);height:min(82vh,860px);background:#fff;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.25);';

            modal.innerHTML = `
                <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(180deg,#f8fafc 0%, #ffffff 100%);">
                    <div>
                        <div style="font-size:16px;font-weight:700;color:#0f172a;">DeepSeek 批量导出</div>
                    </div>
                    <button id="ds-batch-close" aria-label="关闭" title="关闭" style="cursor:pointer;border:none;background:#e5e7eb;color:#1f2937;width:32px;height:32px;border-radius:999px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;transition:background .2s ease;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                </div>
                <div class="db-batch-scroll" style="padding:16px 20px;overflow:auto;background:#f8fafc;">
                    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#fff;">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
                            <div style="font-size:13px;font-weight:700;color:#0f172a;">历史会话</div>
                            <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#475569;">
                                <span>获取数量</span>
                                <input id="ds-batch-limit" type="text" inputmode="numeric" value="30" style="width:72px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:8px;padding:6px 8px;font-size:12px;background:#fff;color:#0f172a;" />
                            </label>
                        </div>
                        <div id="ds-batch-status" style="font-size:11px;color:#64748b;margin-top:8px;">正在加载历史会话...</div>
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <button id="ds-batch-toggle-select" style="border:1px solid #93c5fd;background:#eff6ff;border-radius:8px;font-size:12px;padding:8px 12px;cursor:pointer;color:#1d4ed8;font-weight:600;">全选</button>
                            </div>
                            <div style="position:relative;display:flex;justify-content:flex-end;align-items:center;">
                                <button id="ds-batch-export-menu-trigger" style="border:1px solid #2563eb;background:#fff;color:#2563eb;border-radius:8px;font-size:12px;padding:7px 12px;cursor:pointer;font-weight:700;display:flex;align-items:center;gap:6px;">
                                    <span>导出</span><span id="ds-batch-export-menu-icon" style="opacity:.9;display:inline-flex;transition:transform .2s ease;transform:rotate(0deg);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span>
                                </button>
                                <div id="ds-batch-export-menu" style="position:absolute;right:0;top:36px;width:100px;background:rgba(255, 255, 255, 0.2);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.35);border-radius:10px;box-shadow:0 10px 30px rgba(15,23,42,.15);padding:0;z-index:7;opacity:0;pointer-events:none;transform:translateY(-8px) scale(0.96);transition:opacity .22s cubic-bezier(0.22,0.61,0.36,1), transform .22s cubic-bezier(0.22,0.61,0.36,1);">
                                    <button class="ds-batch-export-item" data-format="json" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">JSON</button>
                                    <button class="ds-batch-export-item" data-format="md" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">Markdown</button>
                                    <button class="ds-batch-export-item" data-format="txt" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">TXT</button>
                                    <button class="ds-batch-export-item" data-format="csv" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">CSV</button>
                                    <button class="ds-batch-export-item" data-format="pdf" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">PDF</button>
                                </div>
                            </div>
                        </div>
                        <div id="ds-batch-list" style="max-height:520px;overflow:auto;border:1px solid #e5e7eb;border-radius:10px;margin-top:12px;background:#fff;"></div>
                    </div>
                </div>
                <style>
                    ${getBatchConversationListStyles('#ds-batch-list')}
                </style>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            const modalLifecycle = setupUnifiedModalLifecycle(overlay, modal);

            let recentConversations = [];
            const messageSelectionByConversation = new Map();
            let loading = false;
            let countHydrationSeq = 0;
            const listEl = modal.querySelector('#ds-batch-list');
            const statusEl = modal.querySelector('#ds-batch-status');
            const limitInput = modal.querySelector('#ds-batch-limit');
            const toggleSelectBtn = modal.querySelector('#ds-batch-toggle-select');
            const exportMenuTrigger = modal.querySelector('#ds-batch-export-menu-trigger');
            const exportMenu = modal.querySelector('#ds-batch-export-menu');
            const exportMenuIcon = modal.querySelector('#ds-batch-export-menu-icon');

            const close = modalLifecycle.close;

            const hideExportMenu = () => {
                exportMenu.style.opacity = '0';
                exportMenu.style.pointerEvents = 'none';
                exportMenu.style.transform = 'translateY(-8px) scale(0.96)';
                if (exportMenuIcon) exportMenuIcon.style.transform = 'rotate(0deg)';
            };

            const showExportMenu = () => {
                exportMenu.style.opacity = '1';
                exportMenu.style.pointerEvents = 'auto';
                exportMenu.style.transform = 'translateY(0) scale(1)';
                if (exportMenuIcon) exportMenuIcon.style.transform = 'rotate(180deg)';
            };

            const getRecentLimit = () => {
                const inputRaw = String(limitInput.value || '').trim();
                const onlyNum = inputRaw.replace(/[^\d]/g, '');
                const raw = Number(onlyNum || 30);
                const n = Number.isFinite(raw) ? Math.floor(raw) : 30;
                const safe = Math.max(1, Math.min(100, n || 30));
                limitInput.value = String(safe);
                return safe;
            };

            const areAllSelected = () => {
                const items = Array.from(listEl.querySelectorAll('.db-batch-ck'));
                return items.length ? items.every((ck) => ck.checked) : false;
            };

            const updateSelectToggleButton = () => {
                const allSelected = areAllSelected();
                toggleSelectBtn.textContent = allSelected ? '全不选' : '全选';
                if (allSelected) {
                    toggleSelectBtn.style.borderColor = '#fecaca';
                    toggleSelectBtn.style.background = '#fef2f2';
                    toggleSelectBtn.style.color = '#b91c1c';
                } else {
                    toggleSelectBtn.style.borderColor = '#93c5fd';
                    toggleSelectBtn.style.background = '#eff6ff';
                    toggleSelectBtn.style.color = '#1d4ed8';
                }
            };

            const renderRecentList = () => {
                renderBatchConversationList(
                    listEl,
                    recentConversations,
                    (c) => buildUnifiedBatchMetaTags(c, { idLabel: '会话ID' }),
                    '未获取到历史会话，请稍后重试或调整获取数量。'
                );
                updateSelectToggleButton();
            };
            const getMissingCountTotal = () => recentConversations.filter((c) => {
                const n = Number(c?.badgeCount ?? c?.messageCount);
                const createdText = String(c?.createdAtText || '').trim();
                return !Number.isFinite(n) || n <= 0 || !createdText || createdText === '-';
            }).length;

            const loadRecentConversations = async () => {
                if (loading) return;
                loading = true;
                countHydrationSeq += 1;
                const limit = getRecentLimit();
                hideExportMenu();
                listEl.innerHTML = '<div class="db-batch-loading"><div class="db-batch-spinner"></div><div>正在加载历史会话...</div></div>';
                statusEl.textContent = `正在加载历史会话（数量: ${limit}）...`;
                try {
                    const result = await fetchDeepSeekRecentConversations(limit, 8);
                    recentConversations = result.conversations;
                    const requested = Number(result?.requested || limit);
                    const obtained = Number(result?.obtained || recentConversations.length);
                    statusEl.textContent = `已加载 ${obtained}/${requested} 个历史会话`;
                    renderRecentList();

                    const runSeq = countHydrationSeq;
                    const missingTotal = getMissingCountTotal();
                    if (missingTotal > 0) {
                        statusEl.textContent = `已加载 ${obtained}/${requested} 个历史会话 · 正在补齐消息数（0/${missingTotal}）...`;
                        hydrateConversationMessageCounts(recentConversations, {
                            concurrency: 2,
                            isCancelled: () => runSeq !== countHydrationSeq || !modal.isConnected,
                            shouldHydrate: (conv) => {
                                const n = Number(conv?.badgeCount ?? conv?.messageCount);
                                const createdText = String(conv?.createdAtText || '').trim();
                                return !Number.isFinite(n) || n <= 0 || !createdText || createdText === '-';
                            },
                            getCount: async (conv) => {
                                const allRes = await fetchDeepSeekConversationMessages(conv.id);
                                const apiSession = allRes?.meta?.chatSession || {};
                                const apiCreatedAtValue = Number(apiSession?.insertedAtValue || 0);
                                const apiUpdatedAtValue = Number(apiSession?.updatedAtValue || 0);
                                const apiCreatedAtText = String(apiSession?.insertedAt || '').trim();
                                const apiUpdatedAtText = String(apiSession?.updatedAt || '').trim();

                                if (Number.isFinite(apiCreatedAtValue) && apiCreatedAtValue > 0) conv.createdAt = apiCreatedAtValue;
                                if (apiCreatedAtText) conv.createdAtText = apiCreatedAtText;
                                if (Number.isFinite(apiUpdatedAtValue) && apiUpdatedAtValue > 0) conv.updatedAt = apiUpdatedAtValue;
                                if (apiUpdatedAtText) conv.updatedAtText = apiUpdatedAtText;

                                return Array.isArray(allRes?.messages) ? allRes.messages.length : null;
                            },
                            onProgress: ({ total, completed }) => {
                                if (runSeq !== countHydrationSeq || !modal.isConnected) return;
                                renderRecentList();
                                statusEl.textContent = `已加载 ${obtained}/${requested} 个历史会话 · 正在补齐消息数（${completed}/${total}）...`;
                            }
                        }).then(({ total, completed, resolved }) => {
                            if (runSeq !== countHydrationSeq || !modal.isConnected) return;
                            if (total > 0 && completed > 0) {
                                statusEl.textContent = `已加载 ${obtained}/${requested} 个历史会话 · 已补齐消息数 ${resolved}/${total}`;
                            }
                        }).catch(() => {
                            if (runSeq !== countHydrationSeq || !modal.isConnected) return;
                            statusEl.textContent = `已加载 ${obtained}/${requested} 个历史会话 · 消息数补齐失败`;
                        });
                    }
                } catch (e) {
                    recentConversations = [];
                    statusEl.textContent = '加载历史会话失败';
                    listEl.innerHTML = `<div style="padding:14px;font-size:12px;color:#b91c1c;">加载失败: ${escapeHtml(e.message || String(e))}</div>`;
                } finally {
                    loading = false;
                }
            };

            const getSelectedConversations = () => {
                const map = new Map(recentConversations.map((c) => [c.id, c]));
                return Array.from(listEl.querySelectorAll('.db-batch-ck:checked'))
                    .map((el) => map.get(el.getAttribute('data-id')))
                    .filter(Boolean);
            };
            const getStoredSelection = (conv) => normalizeMessageSelectionIndices(
                messageSelectionByConversation.get(String(conv.id)),
                Number.MAX_SAFE_INTEGER
            );
            const storeSelection = (conv, indices) => {
                messageSelectionByConversation.set(String(conv.id), Array.isArray(indices) ? indices.slice() : []);
            };

            const openConversationPreview = async (conv) => {
                const previewLoader = async () => {
                    const allRes = await fetchDeepSeekConversationMessages(conv.id);
                    return {
                        source: 'API(/api/v0/chat/history_messages)',
                        deepseekMeta: allRes.meta || null,
                        messages: allRes.messages.map((m) => ({
                            role: m.role,
                            text: String(m.text || ''),
                            isThought: Boolean(m.isThought),
                            fragmentType: String(m.fragmentType || ''),
                            hasThought: Boolean(m.hasThought),
                            textWithoutThought: String(m.textWithoutThought || m.text || '')
                        }))
                    };
                };
                previewLoader.initialSelectedIndices = getStoredSelection(conv);
                previewLoader.onSelectionChange = (indices) => storeSelection(conv, indices);
                openBatchConversationPreviewModal('DeepSeek', conv.title || conv.id, previewLoader);
            };

            const runBatchExport = async (format) => {
                hideExportMenu();
                const selected = getSelectedConversations();
                if (!selected.length) {
                    alert('请先勾选至少一个历史会话');
                    return;
                }

                const out = [];
                let failCount = 0;

                for (let i = 0; i < selected.length; i += 1) {
                    const conv = selected[i];
                    statusEl.textContent = `正在导出第 ${i + 1}/${selected.length} 个会话: ${conv.title || conv.id}`;
                    try {
                        const allRes = await fetchDeepSeekConversationMessages(conv.id);
                        const apiSession = allRes?.meta?.chatSession || {};
                        const apiCreatedAtValue = Number(apiSession?.insertedAtValue || 0);
                        const apiUpdatedAtValue = Number(apiSession?.updatedAtValue || 0);
                        const apiCreatedAtText = String(apiSession?.insertedAt || '').trim();
                        const apiUpdatedAtText = String(apiSession?.updatedAt || '').trim();
                        const messages = allRes.messages.map((m) => ({
                            role: m.role,
                            text: String(m.text || ''),
                            isThought: Boolean(m.isThought),
                            fragmentType: String(m.fragmentType || '')
                        }));
                        const pickedMessages = applyMessageSelection(messages, getStoredSelection(conv));
                        out.push({
                            conversationId: conv.id,
                            title: conv.title,
                            updatedAt: Number.isFinite(apiUpdatedAtValue) && apiUpdatedAtValue > 0 ? apiUpdatedAtValue : (conv.updatedAt || 0),
                            updatedAtText: apiUpdatedAtText || conv.updatedAtText || '',
                            createdAt: Number.isFinite(apiCreatedAtValue) && apiCreatedAtValue > 0 ? apiCreatedAtValue : (conv.createdAt || 0),
                            createdAtText: apiCreatedAtText || conv.createdAtText || '',
                            pinned: Boolean(conv.pinned),
                            messageCount: pickedMessages.length,
                            messages: pickedMessages
                        });
                    } catch (e) {
                        failCount += 1;
                        console.warn('AI-Chat-Helper: DeepSeek 批量导出会话失败', conv?.id, e);
                    }
                }

                if (!out.length) {
                    alert('无可导出的会话数据');
                    return;
                }

                await exportDeepSeekBatchConversations(out, format);
                statusEl.textContent = `批量导出完成，成功 ${out.length} 个会话${failCount ? `，失败 ${failCount} 个` : ''}`;
                alert(`批量导出完成：成功 ${out.length} 个会话${failCount ? `，失败 ${failCount} 个` : ''}。已按会话标题分别打包为 ZIP。${format === 'pdf' ? 'PDF 选项导出为可打印 HTML 压缩包。' : ''}`);
            };

            modal.querySelector('#ds-batch-close').addEventListener('click', close);
            exportMenuTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (exportMenu.style.opacity === '1') hideExportMenu();
                else showExportMenu();
            });
            modal.addEventListener('click', (e) => {
                const target = e.target;
                if (target !== exportMenu && target !== exportMenuTrigger && !exportMenu.contains(target)) hideExportMenu();
            });
            limitInput.addEventListener('change', () => loadRecentConversations());
            limitInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    loadRecentConversations();
                }
            });
            toggleSelectBtn.addEventListener('click', () => {
                const allSelected = areAllSelected();
                listEl.querySelectorAll('.db-batch-ck').forEach((ck) => { ck.checked = !allSelected; });
                updateSelectToggleButton();
            });
            bindBatchConversationListInteractions(
                listEl,
                (key) => recentConversations.find((c) => String(c.id) === String(key)) || null,
                openConversationPreview,
                updateSelectToggleButton
            );
            modal.querySelectorAll('.ds-batch-export-item').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    runBatchExport(btn.getAttribute('data-format'));
                });
            });

            loadRecentConversations();
        }

        function openDoubaoBatchExportModal() {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;z-index:1000001;background:rgba(2,6,23,0.55);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(3px);';

            const modal = document.createElement('div');
            modal.style.cssText = 'width:min(980px,94vw);height:min(82vh,860px);background:#fff;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.25);';

            modal.innerHTML = `
                <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(180deg,#f8fafc 0%, #ffffff 100%);">
                    <div>
                        <div style="font-size:16px;font-weight:700;color:#0f172a;">豆包批量导出</div>
                    </div>
                    <button id="db-batch-close" aria-label="关闭" title="关闭" style="cursor:pointer;border:none;background:#e5e7eb;color:#1f2937;width:32px;height:32px;border-radius:999px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;transition:background .2s ease;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                </div>
                <div class="db-batch-scroll" style="padding:16px 20px;overflow:auto;background:#f8fafc;">
                    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#fff;">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
                            <div style="font-size:13px;font-weight:700;color:#0f172a;">历史会话</div>
                            <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#475569;">
                                <span>获取数量</span>
                                <input id="db-batch-limit" type="text" inputmode="numeric" value="20" style="width:72px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:8px;padding:6px 8px;font-size:12px;background:#fff;color:#0f172a;" />
                            </label>
                        </div>
                        <div id="db-batch-status" style="font-size:11px;color:#64748b;margin-top:8px;">正在加载历史会话...</div>
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <button id="db-batch-toggle-select" style="border:1px solid #93c5fd;background:#eff6ff;border-radius:8px;font-size:12px;padding:8px 12px;cursor:pointer;color:#1d4ed8;font-weight:600;">全选</button>
                            </div>
                            <div style="position:relative;display:flex;justify-content:flex-end;align-items:center;">
                                <button id="db-batch-export-menu-trigger" style="border:1px solid #2563eb;background:#fff;color:#2563eb;border-radius:8px;font-size:12px;padding:7px 12px;cursor:pointer;font-weight:700;display:flex;align-items:center;gap:6px;">
                                    <span>导出</span><span id="db-batch-export-menu-icon" style="opacity:.9;display:inline-flex;transition:transform .2s ease;transform:rotate(0deg);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span>
                                </button>
                                <div id="db-batch-export-menu" style="position:absolute;right:0;top:36px;width:100px;background:rgba(255, 255, 255, 0.2);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,0.35);border-radius:10px;box-shadow:0 10px 30px rgba(15,23,42,.15);padding:0;z-index:7;opacity:0;pointer-events:none;transform:translateY(-8px) scale(0.96);transition:opacity .22s cubic-bezier(0.22,0.61,0.36,1), transform .22s cubic-bezier(0.22,0.61,0.36,1);">
                                    <button class="db-batch-export-item" data-format="json" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">JSON</button>
                                    <button class="db-batch-export-item" data-format="md" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">Markdown</button>
                                    <button class="db-batch-export-item" data-format="txt" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">TXT</button>
                                    <button class="db-batch-export-item" data-format="csv" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">CSV</button>
                                    <button class="db-batch-export-item" data-format="pdf" style="display:block;width:100%;margin:0;text-align:center;background:transparent;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">PDF</button>
                                </div>
                            </div>
                        </div>
                        <div id="db-batch-list" style="max-height:520px;overflow:auto;border:1px solid #e5e7eb;border-radius:10px;margin-top:12px;background:#fff;"></div>
                    </div>
                </div>
                <style>
                    ${getBatchConversationListStyles('#db-batch-list')}
                </style>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            const modalLifecycle = setupUnifiedModalLifecycle(overlay, modal);

            let recentConversations = [];
            const messageSelectionByConversation = new Map();
            let loading = false;
            const listEl = modal.querySelector('#db-batch-list');
            const statusEl = modal.querySelector('#db-batch-status');
            const limitInput = modal.querySelector('#db-batch-limit');
            const toggleSelectBtn = modal.querySelector('#db-batch-toggle-select');
            const exportMenuTrigger = modal.querySelector('#db-batch-export-menu-trigger');
            const exportMenu = modal.querySelector('#db-batch-export-menu');
            const exportMenuIcon = modal.querySelector('#db-batch-export-menu-icon');

            const close = modalLifecycle.close;

            const setLoading = (isLoading) => {
                loading = Boolean(isLoading);
                if (loading) {
                    listEl.innerHTML = '<div class="db-batch-loading"><div class="db-batch-spinner"></div><div>正在加载历史会话...</div></div>';
                }
            };

            const hideExportMenu = () => {
                exportMenu.style.opacity = '0';
                exportMenu.style.pointerEvents = 'none';
                exportMenu.style.transform = 'translateY(-8px) scale(0.96)';
                if (exportMenuIcon) exportMenuIcon.style.transform = 'rotate(0deg)';
            };

            const showExportMenu = () => {
                exportMenu.style.opacity = '1';
                exportMenu.style.pointerEvents = 'auto';
                exportMenu.style.transform = 'translateY(0) scale(1)';
                if (exportMenuIcon) exportMenuIcon.style.transform = 'rotate(180deg)';
            };

            const getRecentLimit = () => {
                const inputRaw = String(limitInput.value || '').trim();
                const onlyNum = inputRaw.replace(/[^\d]/g, '');
                const raw = Number(onlyNum || 20);
                if (onlyNum !== inputRaw) {
                    statusEl.textContent = '获取数量需为整数，已自动过滤非数字字符';
                }
                const n = Number.isFinite(raw) ? Math.floor(raw) : 20;
                const safe = Math.max(1, Math.min(100, n || 20));
                limitInput.value = String(safe);
                return safe;
            };

            const renderRecentList = () => {
                renderBatchConversationList(
                    listEl,
                    recentConversations,
                    (c) => buildUnifiedBatchMetaTags(c, { idLabel: '会话ID' }),
                    '未获取到历史会话，请稍后重试或调整获取数量。'
                );
                updateSelectToggleButton();
            };

            const areAllSelected = () => {
                const items = Array.from(listEl.querySelectorAll('.db-batch-ck'));
                if (!items.length) return false;
                return items.every((ck) => ck.checked);
            };

            const updateSelectToggleButton = () => {
                const allSelected = areAllSelected();
                if (allSelected) {
                    toggleSelectBtn.textContent = '全不选';
                    toggleSelectBtn.style.borderColor = '#fecaca';
                    toggleSelectBtn.style.background = '#fef2f2';
                    toggleSelectBtn.style.color = '#b91c1c';
                } else {
                    toggleSelectBtn.textContent = '全选';
                    toggleSelectBtn.style.borderColor = '#93c5fd';
                    toggleSelectBtn.style.background = '#eff6ff';
                    toggleSelectBtn.style.color = '#1d4ed8';
                }
            };

            const loadRecentConversations = async () => {
                if (loading) return;
                const limit = getRecentLimit();
                hideExportMenu();
                setLoading(true);
                statusEl.textContent = `正在加载历史会话（数量: ${limit}）...`;
                try {
                    const result = await fetchDoubaoRecentConversations('', limit);
                    recentConversations = result.conversations;
                    const requested = Number(result?.requested || limit);
                    const obtained = Number(result?.obtained || recentConversations.length);
                    statusEl.textContent = `已加载 ${obtained}/${requested} 个历史会话`;
                    renderRecentList();
                } catch (e) {
                    recentConversations = [];
                    statusEl.textContent = '加载历史会话失败';
                    listEl.innerHTML = `<div style="padding:14px;font-size:12px;color:#b91c1c;">加载失败: ${escapeHtml(e.message || String(e))}</div>`;
                } finally {
                    loading = false;
                }
            };

            const getSelectedConversations = () => {
                const map = new Map(recentConversations.map((c) => [c.id, c]));
                return Array.from(listEl.querySelectorAll('.db-batch-ck:checked'))
                    .map((el) => map.get(el.getAttribute('data-id')))
                    .filter(Boolean);
            };

            const getStoredSelection = (conv) => normalizeMessageSelectionIndices(
                messageSelectionByConversation.get(String(conv.id)),
                Number.MAX_SAFE_INTEGER
            );

            const storeSelection = (conv, indices) => {
                messageSelectionByConversation.set(String(conv.id), Array.isArray(indices) ? indices.slice() : []);
            };

            const openConversationPreview = async (conv) => {
                const previewLoader = async () => {
                    const allRes = await fetchDoubaoAllConversationMessages(conv.id, 30, () => {});
                    return {
                        title: conv.title || `会话 ${conv.id}`,
                        messages: allRes.messages.map((m) => ({
                            role: m.role,
                            text: String(m.text || ''),
                            isArtifact: Boolean(m.isArtifact)
                        }))
                    };
                };
                previewLoader.initialSelectedIndices = getStoredSelection(conv);
                previewLoader.onSelectionChange = (indices) => storeSelection(conv, indices);
                openBatchConversationPreviewModal('豆包', conv.title || conv.id, previewLoader);
            };

            const runBatchExport = async (format) => {
                hideExportMenu();
                const selected = getSelectedConversations();
                if (!selected.length) {
                    alert('请先勾选至少一个历史会话');
                    return;
                }

                const out = [];
                let failCount = 0;

                for (let i = 0; i < selected.length; i += 1) {
                    const conv = selected[i];
                    try {
                        const allRes = await fetchDoubaoAllConversationMessages(conv.id, 30, () => {});
                        const messages = allRes.messages.map((m) => ({
                            role: m.role,
                            text: String(m.text || ''),
                            isArtifact: Boolean(m.isArtifact)
                        }));
                        const pickedMessages = applyMessageSelection(messages, getStoredSelection(conv));

                        out.push({
                            conversationId: conv.id,
                            title: conv.title,
                            updatedAt: conv.updatedAt || 0,
                            updatedAtText: conv.updatedAtText || '',
                            pages: allRes.pages,
                            messageCount: pickedMessages.length,
                            messages: pickedMessages
                        });
                    } catch (e) {
                        failCount += 1;
                        console.warn('AI-Chat-Helper: 豆包批量导出会话失败', conv?.id, e);
                    }
                }

                if (!out.length) {
                    alert('无可导出的会话数据');
                    return;
                }

                await exportDoubaoBatchConversations(out, format);
                alert(`批量导出完成：成功 ${out.length} 个会话${failCount ? `，失败 ${failCount} 个` : ''}。已按会话标题分别打包为 ZIP。${format === 'pdf' ? 'PDF 选项导出为可打印 HTML 压缩包。' : ''}`);
            };

            modal.querySelector('#db-batch-close').addEventListener('click', close);

            exportMenuTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (exportMenu.style.opacity === '1') hideExportMenu();
                else showExportMenu();
            });

            modal.addEventListener('click', (e) => {
                const target = e.target;
                if (target !== exportMenu && target !== exportMenuTrigger && !exportMenu.contains(target)) {
                    hideExportMenu();
                }
            });

            limitInput.addEventListener('change', () => {
                loadRecentConversations();
            });
            limitInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    loadRecentConversations();
                }
            });

            toggleSelectBtn.addEventListener('click', () => {
                const allSelected = areAllSelected();
                listEl.querySelectorAll('.db-batch-ck').forEach((ck) => {
                    ck.checked = !allSelected;
                });
                updateSelectToggleButton();
            });

            bindBatchConversationListInteractions(
                listEl,
                (key) => recentConversations.find((c) => String(c.id) === String(key)) || null,
                openConversationPreview,
                updateSelectToggleButton
            );

            modal.querySelectorAll('.db-batch-export-item').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    runBatchExport(btn.getAttribute('data-format'));
                });
            });

            loadRecentConversations();
        }

        function openQwenBatchExportModal() {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;z-index:1000001;background:rgba(2,6,23,0.55);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(3px);';

            const modal = document.createElement('div');
            modal.style.cssText = 'width:min(980px,94vw);height:min(82vh,860px);background:#fff;border-radius:16px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.25);';

            modal.innerHTML = `
                <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(180deg,#f8fafc 0%, #ffffff 100%);">
                    <div>
                        <div style="font-size:16px;font-weight:700;color:#0f172a;">千问批量导出</div>
                    </div>
                    <button id="qw-batch-close" aria-label="关闭" title="关闭" style="cursor:pointer;border:none;background:#e5e7eb;color:#1f2937;width:32px;height:32px;border-radius:999px;line-height:1;display:flex;align-items:center;justify-content:center;padding:0;transition:background .2s ease;"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
                </div>
                <div class="db-batch-scroll" style="padding:16px 20px;overflow:auto;background:#f8fafc;">
                    <div style="border:1px solid #e2e8f0;border-radius:12px;padding:14px;background:#fff;">
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
                            <div style="font-size:13px;font-weight:700;color:#0f172a;">历史会话</div>
                            <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#475569;">
                                <span>获取数量</span>
                                <input id="qw-batch-limit" type="text" inputmode="numeric" value="50" style="width:72px;box-sizing:border-box;border:1px solid #d1d5db;border-radius:8px;padding:6px 8px;font-size:12px;background:#fff;color:#0f172a;" />
                            </label>
                        </div>
                        <div id="qw-batch-status" style="font-size:11px;color:#64748b;margin-top:8px;">正在加载历史会话...</div>
                        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:12px;">
                            <div style="display:flex;align-items:center;gap:8px;">
                                <button id="qw-batch-toggle-select" style="border:1px solid #93c5fd;background:#eff6ff;border-radius:8px;font-size:12px;padding:8px 12px;cursor:pointer;color:#1d4ed8;font-weight:600;">全选</button>
                            </div>
                            <div style="position:relative;display:flex;justify-content:flex-end;align-items:center;">
                                <button id="qw-batch-export-menu-trigger" style="border:1px solid #2563eb;background:#2563eb;color:#fff;border-radius:8px;font-size:12px;padding:8px 14px;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:6px;">
                                    <span>导出</span><span id="qw-batch-export-menu-icon" style="opacity:.9;display:inline-flex;transition:transform .2s ease;transform:rotate(0deg);"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg></span>
                                </button>
                                <div id="qw-batch-export-menu" style="position:absolute;right:0;top:40px;width:140px;background:#fff;border:1px solid #dbe3ee;border-radius:10px;box-shadow:0 10px 30px rgba(15,23,42,.15);padding:8px;z-index:5;opacity:0;pointer-events:none;transform:translateY(-8px) scale(0.96);transition:opacity .22s cubic-bezier(0.22, 0.61, 0.36, 1), transform .22s cubic-bezier(0.22, 0.61, 0.36, 1);">
                                    <button class="qw-batch-export-item" data-format="json" style="display:block;width:100%;margin:0;text-align:center;background:#ffffff;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">JSON</button>
                                    <button class="qw-batch-export-item" data-format="md" style="display:block;width:100%;margin:0;text-align:center;background:#ffffff;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">Markdown</button>
                                    <button class="qw-batch-export-item" data-format="txt" style="display:block;width:100%;margin:0;text-align:center;background:#ffffff;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">TXT</button>
                                    <button class="qw-batch-export-item" data-format="csv" style="display:block;width:100%;margin:0;text-align:center;background:#ffffff;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">CSV</button>
                                    <button class="qw-batch-export-item" data-format="pdf" style="display:block;width:100%;margin:0;text-align:center;background:#ffffff;color:#2563eb;border-radius:0;padding:7px 10px;font-size:12px;font-weight:700;cursor:pointer;transition:border-color .18s ease, box-shadow .18s ease, background-color .18s ease;border:none;">PDF</button>
                                </div>
                            </div>
                        </div>
                        <div id="qw-batch-list" style="max-height:520px;overflow:auto;border:1px solid #e5e7eb;border-radius:10px;margin-top:12px;background:#fff;"></div>
                    </div>
                </div>
                <style>
                    ${getBatchConversationListStyles('#qw-batch-list')}
                </style>
            `;

            overlay.appendChild(modal);
            document.body.appendChild(overlay);
            const modalLifecycle = setupUnifiedModalLifecycle(overlay, modal);

            let recentConversations = [];
            const messageSelectionByConversation = new Map();
            let loading = false;
            let countHydrationSeq = 0;
            const listEl = modal.querySelector('#qw-batch-list');
            const statusEl = modal.querySelector('#qw-batch-status');
            const limitInput = modal.querySelector('#qw-batch-limit');
            const toggleSelectBtn = modal.querySelector('#qw-batch-toggle-select');
            const exportMenuTrigger = modal.querySelector('#qw-batch-export-menu-trigger');
            const exportMenu = modal.querySelector('#qw-batch-export-menu');
            const exportMenuIcon = modal.querySelector('#qw-batch-export-menu-icon');

            const close = modalLifecycle.close;
            const hideExportMenu = () => {
                exportMenu.style.opacity = '0';
                exportMenu.style.pointerEvents = 'none';
                exportMenu.style.transform = 'translateY(-8px) scale(0.96)';
                if (exportMenuIcon) exportMenuIcon.style.transform = 'rotate(0deg)';
            };
            const showExportMenu = () => {
                exportMenu.style.opacity = '1';
                exportMenu.style.pointerEvents = 'auto';
                exportMenu.style.transform = 'translateY(0) scale(1)';
                if (exportMenuIcon) exportMenuIcon.style.transform = 'rotate(180deg)';
            };
            const getRecentLimit = () => {
                const inputRaw = String(limitInput.value || '').trim();
                const onlyNum = inputRaw.replace(/[^\d]/g, '');
                const raw = Number(onlyNum || 50);
                const n = Number.isFinite(raw) ? Math.floor(raw) : 50;
                const safe = Math.max(1, Math.min(100, n || 50));
                limitInput.value = String(safe);
                return safe;
            };
            const areAllSelected = () => {
                const items = Array.from(listEl.querySelectorAll('.db-batch-ck'));
                return items.length ? items.every((ck) => ck.checked) : false;
            };
            const updateSelectToggleButton = () => {
                const allSelected = areAllSelected();
                toggleSelectBtn.textContent = allSelected ? '全不选' : '全选';
            };
            const renderRecentList = () => {
                renderBatchConversationList(
                    listEl,
                    recentConversations,
                    (c) => buildUnifiedBatchMetaTags(c, { idLabel: '会话ID' }),
                    '未获取到历史会话，请稍后重试。'
                );
                updateSelectToggleButton();
            };
            const getMissingCountTotal = () => recentConversations.filter((c) => {
                const n = Number(c?.badgeCount ?? c?.messageCount);
                return !Number.isFinite(n) || n <= 0;
            }).length;
            const loadRecentConversations = async () => {
                if (loading) return;
                loading = true;
                countHydrationSeq += 1;
                const limit = getRecentLimit();
                hideExportMenu();
                listEl.innerHTML = '<div class="db-batch-loading"><div class="db-batch-spinner"></div><div>正在加载历史会话...</div></div>';
                statusEl.textContent = `正在加载历史会话（数量: ${limit}）...`;
                try {
                    const result = await fetchQwenRecentConversations(limit, 5);
                    recentConversations = result.conversations;
                    const requested = Number(result?.requested || limit);
                    const obtained = Number(result?.obtained || recentConversations.length);
                    statusEl.textContent = `已加载 ${obtained}/${requested} 个历史会话`;
                    renderRecentList();

                    const runSeq = countHydrationSeq;
                    const missingTotal = getMissingCountTotal();
                    if (missingTotal > 0) {
                        statusEl.textContent = `已加载 ${obtained}/${requested} 个历史会话 · 正在补齐消息数（0/${missingTotal}）...`;
                        hydrateConversationMessageCounts(recentConversations, {
                            concurrency: 2,
                            isCancelled: () => runSeq !== countHydrationSeq || !modal.isConnected,
                            shouldHydrate: (conv) => {
                                const n = Number(conv?.badgeCount ?? conv?.messageCount);
                                return !Number.isFinite(n) || n <= 0;
                            },
                            getCount: async (conv) => {
                                const allRes = await fetchQwenAllConversationMessages(conv.id, 20, () => {});
                                return Array.isArray(allRes?.messages) ? allRes.messages.length : null;
                            },
                            onProgress: ({ total, completed }) => {
                                if (runSeq !== countHydrationSeq || !modal.isConnected) return;
                                renderRecentList();
                                statusEl.textContent = `已加载 ${obtained}/${requested} 个历史会话 · 正在补齐消息数（${completed}/${total}）...`;
                            }
                        }).then(({ total, completed, resolved }) => {
                            if (runSeq !== countHydrationSeq || !modal.isConnected) return;
                            if (total > 0 && completed > 0) {
                                statusEl.textContent = `已加载 ${obtained}/${requested} 个历史会话 · 已补齐消息数 ${resolved}/${total}`;
                            }
                        }).catch(() => {
                            if (runSeq !== countHydrationSeq || !modal.isConnected) return;
                            statusEl.textContent = `已加载 ${obtained}/${requested} 个历史会话 · 消息数补齐失败`;
                        });
                    }
                } catch (e) {
                    recentConversations = [];
                    statusEl.textContent = '加载历史会话失败';
                    listEl.innerHTML = `<div style="padding:14px;font-size:12px;color:#b91c1c;">加载失败: ${escapeHtml(e.message || String(e))}</div>`;
                } finally {
                    loading = false;
                }
            };
            const getSelectedConversations = () => {
                const map = new Map(recentConversations.map((c) => [c.id, c]));
                return Array.from(listEl.querySelectorAll('.db-batch-ck:checked'))
                    .map((el) => map.get(el.getAttribute('data-id')))
                    .filter(Boolean);
            };

            const getStoredSelection = (conv) => normalizeMessageSelectionIndices(
                messageSelectionByConversation.get(String(conv.id)),
                Number.MAX_SAFE_INTEGER
            );

            const storeSelection = (conv, indices) => {
                messageSelectionByConversation.set(String(conv.id), Array.isArray(indices) ? indices.slice() : []);
            };

            const openConversationPreview = async (conv) => {
                const previewLoader = async () => {
                    const allRes = await fetchQwenAllConversationMessages(conv.id, 20, () => {});
                    return {
                        title: conv.title || `会话 ${conv.id}`,
                        messages: allRes.messages.map((m) => ({
                            role: m.role,
                            text: String(m.text || '')
                        }))
                    };
                };
                previewLoader.initialSelectedIndices = getStoredSelection(conv);
                previewLoader.onSelectionChange = (indices) => storeSelection(conv, indices);
                openBatchConversationPreviewModal('千问', conv.title || conv.id, previewLoader);
            };

            const runBatchExport = async (format) => {
                hideExportMenu();
                const selected = getSelectedConversations();
                if (!selected.length) {
                    alert('请先勾选至少一个历史会话');
                    return;
                }
                const out = [];
                let failCount = 0;
                for (let i = 0; i < selected.length; i += 1) {
                    const conv = selected[i];
                    try {
                        const allRes = await fetchQwenAllConversationMessages(conv.id, 20, () => {});
                        const messages = allRes.messages.map((m) => ({
                            role: m.role,
                            text: String(m.text || '')
                        }));
                        const pickedMessages = applyMessageSelection(messages, getStoredSelection(conv));
                        out.push({
                            conversationId: conv.id,
                            title: conv.title,
                            updatedAt: conv.updatedAt || 0,
                            updatedAtText: conv.updatedAtText || '',
                            pages: allRes.pages,
                            messageCount: pickedMessages.length,
                            messages: pickedMessages
                        });
                    } catch (e) {
                        failCount += 1;
                        console.warn('AI-Chat-Helper: 千问批量导出会话失败', conv?.id, e);
                    }
                }
                if (!out.length) {
                    alert('无可导出的会话数据');
                    return;
                }
                await exportQwenBatchConversations(out, format);
                alert(`批量导出完成：成功 ${out.length} 个会话${failCount ? `，失败 ${failCount} 个` : ''}。已按会话标题分别打包为 ZIP。${format === 'pdf' ? 'PDF 选项导出为可打印 HTML 压缩包。' : ''}`);
            };

            modal.querySelector('#qw-batch-close').addEventListener('click', close);
            exportMenuTrigger.addEventListener('click', (e) => {
                e.stopPropagation();
                if (exportMenu.style.opacity === '1') hideExportMenu();
                else showExportMenu();
            });
            modal.addEventListener('click', (e) => {
                const target = e.target;
                if (target !== exportMenu && target !== exportMenuTrigger && !exportMenu.contains(target)) hideExportMenu();
            });
            limitInput.addEventListener('change', () => loadRecentConversations());
            limitInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    loadRecentConversations();
                }
            });
            toggleSelectBtn.addEventListener('click', () => {
                const allSelected = areAllSelected();
                listEl.querySelectorAll('.db-batch-ck').forEach((ck) => { ck.checked = !allSelected; });
                updateSelectToggleButton();
            });
            bindBatchConversationListInteractions(
                listEl,
                (key) => recentConversations.find((c) => String(c.id) === String(key)) || null,
                openConversationPreview,
                updateSelectToggleButton
            );
            modal.querySelectorAll('.qw-batch-export-item').forEach((btn) => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    runBatchExport(btn.getAttribute('data-format'));
                });
            });

            loadRecentConversations();
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
                const apiMsgs = await getQwenMessagesForExport();
                source = 'API(/api/v1/session/msg/list)';
                if (apiMsgs.length) {
                    list.push(...apiMsgs);
                } else {
                    source = 'API(/api/v1/session/msg/list)-FAILED';
                    console.warn('AI-Chat-Helper: 千问导出已禁用 DOM 回退，当前仅支持 API 获取。');
                    return { messages: [], source };
                }
            } else if (isDoubao) {
                const apiMsgs = await getDoubaoMessagesByApi();
                source = 'API(/im/chain/single)';
                if (apiMsgs.length) {
                    list.push(...apiMsgs);
                } else {
                    source = 'API(/im/chain/single)-FAILED';
                    console.warn('AI-Chat-Helper: 豆包导出已禁用 DOM 回退，当前仅支持 API 获取。');
                    return { messages: [], source };
                }
            } else if (isDeepSeek) {
                const apiMsgs = await getDeepSeekMessagesByApi();
                source = 'API(/api/v0/chat/history_messages)';
                if (apiMsgs.length) {
                    list.push(...aggregateDeepSeekMessagesForExport(apiMsgs));
                } else {
                    source = 'API(/api/v0/chat/history_messages)-FAILED';
                    console.warn('AI-Chat-Helper: DeepSeek 导出已禁用 DOM 回退，当前仅支持 API 获取。');
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

            function renderInlineMarkdownForPdf(text) {
                const src = String(text || '');
                const tokens = [];
                const toToken = (type, content) => {
                    const key = `@@MDTOKEN_${tokens.length}@@`;
                    tokens.push({ key, type, content: String(content || '') });
                    return key;
                };

                // 先提取代码和数学公式，避免后续转义破坏内容
                let mixed = src
                    .replace(/`([^`\n]+)`/g, (_, code) => toToken('code', code))
                    .replace(/\$\$([\s\S]+?)\$\$/g, (_, expr) => toToken('math-display', expr))
                    .replace(/\$([^$\n]+)\$/g, (_, expr) => toToken('math-inline', expr));

                let out = escapeHtml(mixed);
                out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                out = out.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
                out = out.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
                out = out.replace(
                    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
                    '<a href="$2" target="_blank" rel="noreferrer">$1</a>'
                );

                tokens.forEach((t) => {
                    const escapedKey = escapeHtml(t.key);
                    if (t.type === 'code') {
                        out = out.replaceAll(escapedKey, `<code>${escapeHtml(t.content)}</code>`);
                    } else if (t.type === 'math-inline') {
                        out = out.replaceAll(escapedKey, `<span class="math-inline">\\(${escapeHtml(t.content)}\\)</span>`);
                    } else if (t.type === 'math-display') {
                        out = out.replaceAll(escapedKey, `<div class="math-display">\\[${escapeHtml(t.content)}\\]</div>`);
                    }
                });
                return out;
            }

            function renderMarkdownToHtmlForPdf(text) {
                const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
                const html = [];

                let paragraph = [];
                let listType = '';
                let listItems = [];
                let quoteLines = [];
                let inCode = false;
                let codeLines = [];

                const splitTableCells = (line) => {
                    const raw = String(line || '').trim();
                    let body = raw;
                    if (body.startsWith('|')) body = body.slice(1);
                    if (body.endsWith('|')) body = body.slice(0, -1);

                    const cells = [];
                    let current = '';
                    let inCode = false;
                    let inMathInline = false;
                    let inMathBlock = false;

                    for (let i = 0; i < body.length; i += 1) {
                        const ch = body[i];
                        const prev = i > 0 ? body[i - 1] : '';
                        const next = i + 1 < body.length ? body[i + 1] : '';

                        if (ch === '`' && prev !== '\\') {
                            inCode = !inCode;
                            current += ch;
                            continue;
                        }

                        if (!inCode && ch === '$' && prev !== '\\') {
                            if (next === '$') {
                                inMathBlock = !inMathBlock;
                                current += '$$';
                                i += 1;
                                continue;
                            }
                            if (!inMathBlock) {
                                inMathInline = !inMathInline;
                            }
                            current += ch;
                            continue;
                        }

                        if (ch === '|' && prev !== '\\' && !inCode && !inMathInline && !inMathBlock) {
                            cells.push(current.trim());
                            current = '';
                            continue;
                        }

                        current += ch;
                    }
                    cells.push(current.trim());
                    return cells;
                };

                const isTableSeparator = (line) => {
                    const cells = splitTableCells(line);
                    if (!cells.length) return false;
                    return cells.every((c) => /^:?-{3,}:?$/.test(String(c || '').trim()));
                };

                const measureTextWidth = (text) => {
                    const s = String(text || '');
                    let score = 0;
                    for (let i = 0; i < s.length; i += 1) {
                        const code = s.charCodeAt(i);
                        if (code <= 127) score += 1;
                        else score += 1.8; // CJK 近似更宽
                    }
                    return Math.max(1, score);
                };

                const normalizeColPercents = (rawPercents, minPct = 8, maxPct = 38) => {
                    const n = rawPercents.length;
                    const out = rawPercents.slice();
                    const locked = new Array(n).fill(false);

                    // 先按上下限钳制
                    for (let i = 0; i < n; i += 1) {
                        if (out[i] < minPct) {
                            out[i] = minPct;
                            locked[i] = true;
                        } else if (out[i] > maxPct) {
                            out[i] = maxPct;
                            locked[i] = true;
                        }
                    }

                    // 将总和归一到 100，优先在未锁定列中分配
                    let total = out.reduce((a, b) => a + b, 0);
                    let guard = 0;
                    while (Math.abs(total - 100) > 0.001 && guard < 12) {
                        guard += 1;
                        const freeIdx = out
                            .map((v, idx) => ({ v, idx }))
                            .filter((x) => !locked[x.idx])
                            .map((x) => x.idx);
                        if (!freeIdx.length) break;
                        const delta = (100 - total) / freeIdx.length;
                        freeIdx.forEach((idx) => {
                            out[idx] += delta;
                            if (out[idx] < minPct) {
                                out[idx] = minPct;
                                locked[idx] = true;
                            } else if (out[idx] > maxPct) {
                                out[idx] = maxPct;
                                locked[idx] = true;
                            }
                        });
                        total = out.reduce((a, b) => a + b, 0);
                    }

                    // 最终微调到100
                    total = out.reduce((a, b) => a + b, 0);
                    if (n > 0 && Math.abs(total - 100) > 0.001) {
                        out[n - 1] += (100 - total);
                    }
                    return out;
                };

                const computeTableColPercents = (headerCells, bodyRows) => {
                    const colCount = Math.max(
                        headerCells.length,
                        ...bodyRows.map((r) => r.length),
                        1
                    );
                    const scores = new Array(colCount).fill(1);
                    const allRows = [headerCells, ...bodyRows];
                    allRows.forEach((row, rowIdx) => {
                        for (let c = 0; c < colCount; c += 1) {
                            const cell = row[c] || '';
                            // 标题列稍微加权，避免被压太窄
                            const weight = rowIdx === 0 ? 1.18 : 1;
                            scores[c] = Math.max(scores[c], measureTextWidth(cell) * weight);
                        }
                    });
                    // 开根号压缩极端差异，避免某一列过大
                    const soft = scores.map((s) => Math.sqrt(s + 1));
                    const sum = soft.reduce((a, b) => a + b, 0) || 1;
                    const rawPct = soft.map((v) => (v / sum) * 100);
                    return normalizeColPercents(rawPct, 8, 38);
                };

                const flushParagraph = () => {
                    if (!paragraph.length) return;
                    html.push(`<p>${paragraph.map((l) => renderInlineMarkdownForPdf(l)).join('<br>')}</p>`);
                    paragraph = [];
                };

                const flushList = () => {
                    if (!listItems.length || !listType) return;
                    const items = listItems.map((item) => `<li>${renderInlineMarkdownForPdf(item)}</li>`).join('');
                    html.push(`<${listType}>${items}</${listType}>`);
                    listItems = [];
                    listType = '';
                };

                const flushQuote = () => {
                    if (!quoteLines.length) return;
                    html.push(`<blockquote>${quoteLines.map((l) => renderInlineMarkdownForPdf(l)).join('<br>')}</blockquote>`);
                    quoteLines = [];
                };

                const flushCode = () => {
                    if (!inCode) return;
                    html.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
                    codeLines = [];
                    inCode = false;
                };

                for (let i = 0; i < lines.length; i += 1) {
                    const line = String(lines[i] || '');
                    const trimmed = line.trim();

                    if (trimmed.startsWith('```')) {
                        flushParagraph();
                        flushList();
                        flushQuote();
                        if (inCode) {
                            flushCode();
                        } else {
                            inCode = true;
                            codeLines = [];
                        }
                        continue;
                    }

                    if (inCode) {
                        codeLines.push(line);
                        continue;
                    }

                    if (!trimmed) {
                        flushParagraph();
                        flushList();
                        flushQuote();
                        continue;
                    }

                    const displayMathMatch = trimmed.match(/^\$\$([\s\S]+)\$\$$/);
                    if (displayMathMatch) {
                        flushParagraph();
                        flushList();
                        flushQuote();
                        html.push(`<div class="math-display">\\[${escapeHtml(displayMathMatch[1])}\\]</div>`);
                        continue;
                    }

                    const headingMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
                    if (headingMatch) {
                        flushParagraph();
                        flushList();
                        flushQuote();
                        const level = Math.min(6, headingMatch[1].length);
                        html.push(`<h${level}>${renderInlineMarkdownForPdf(headingMatch[2])}</h${level}>`);
                        continue;
                    }

                    const quoteMatch = line.match(/^\s*>\s?(.*)$/);
                    if (quoteMatch) {
                        flushParagraph();
                        flushList();
                        quoteLines.push(quoteMatch[1] || '');
                        continue;
                    }

                    const ulMatch = line.match(/^\s*[-*+]\s+(.+)$/);
                    if (ulMatch) {
                        flushParagraph();
                        flushQuote();
                        if (listType && listType !== 'ul') flushList();
                        listType = 'ul';
                        listItems.push(ulMatch[1]);
                        continue;
                    }

                    const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
                    if (olMatch) {
                        flushParagraph();
                        flushQuote();
                        if (listType && listType !== 'ol') flushList();
                        listType = 'ol';
                        listItems.push(olMatch[1]);
                        continue;
                    }

                    if (line.includes('|') && isTableSeparator(lines[i + 1])) {
                        flushParagraph();
                        flushList();
                        flushQuote();

                        const headerCells = splitTableCells(line);
                        const separatorCells = splitTableCells(lines[i + 1]);
                        if (!headerCells.length || headerCells.length !== separatorCells.length) {
                            paragraph.push(line);
                            continue;
                        }
                        const bodyRows = [];
                        let j = i + 2;
                        while (j < lines.length) {
                            const rowLine = String(lines[j] || '');
                            if (!rowLine.trim() || !rowLine.includes('|')) break;
                            bodyRows.push(splitTableCells(rowLine));
                            j += 1;
                        }

                        const colCount = headerCells.length;
                        bodyRows.forEach((row) => {
                            if (row.length > colCount) {
                                const kept = row.slice(0, colCount - 1);
                                const mergedTail = row.slice(colCount - 1).join(' | ');
                                row.length = 0;
                                row.push(...kept, mergedTail);
                            } else {
                                while (row.length < colCount) row.push('');
                            }
                        });

                        const thead = `<thead><tr>${headerCells.map((c) => `<th>${renderInlineMarkdownForPdf(c)}</th>`).join('')}</tr></thead>`;
                        const colPercents = computeTableColPercents(headerCells, bodyRows);
                        const colgroup = `<colgroup>${colPercents.map((p) => `<col style="width:${p.toFixed(2)}%">`).join('')}</colgroup>`;
                        const tbody = `<tbody>${bodyRows.map((row) => `<tr>${row.map((c) => `<td>${renderInlineMarkdownForPdf(c)}</td>`).join('')}</tr>`).join('')}</tbody>`;
                        html.push(`<div class="table-wrap"><table class="pdf-table">${colgroup}${thead}${tbody}</table></div>`);

                        i = j - 1;
                        continue;
                    }

                    flushList();
                    flushQuote();
                    paragraph.push(line);
                }

                flushParagraph();
                flushList();
                flushQuote();
                flushCode();

                return html.join('\n');
            }

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
                if (!win) {
                    alert('PDF 导出窗口被浏览器拦截，请允许弹窗后重试。');
                    return;
                }
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
                    .header { border-bottom: 3px solid #3b82f6; padding-bottom: 16px; margin-bottom: 40px; color: #1e40af; display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; column-gap: 12px; }
                    .header .title { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
                    .header .platform { justify-self: center; font-size: 12px; font-weight: 700; color: #1d4ed8; letter-spacing: 0.4px; padding: 4px 10px; border-radius: 999px; background: #eff6ff; border: 1px solid #bfdbfe; white-space: nowrap; }
                    .header .ver { justify-self: end; font-size:12px; color:#94a3b8; font-weight:500; text-align: right; }
                    .msg { margin-bottom: 25px; padding: 24px; border-radius: 16px; line-height: 1.6; position: relative; border: 1px solid #e2e8f0; transition: transform 0.2s; }
                    .user { background: #f0f9ff; border-color: #bae6fd; }
                    .assistant { background: #ffffff; border-color: #f1f5f9; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
                    .role-badge { display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; margin-bottom: 14px; text-transform: uppercase; color: #64748b; }
                    .user .role-badge { color: #0369a1; }
                    .assistant .role-badge { color: #4b5563; }
                    
                    /* 万能代码块与排版适配 */
                    .text { font-size: 14px; color: #334155; line-height: 1.7; word-break: break-word; }
                    .text h1, .text h2, .text h3, .text h4, .text h5, .text h6 { margin: 16px 0 10px; color: #0f172a; line-height: 1.35; }
                    .text h1 { font-size: 22px; }
                    .text h2 { font-size: 20px; }
                    .text h3 { font-size: 18px; }
                    .text h4 { font-size: 16px; }
                    .text h5 { font-size: 15px; }
                    .text h6 { font-size: 14px; }
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
                    .text a { color: #1d4ed8; text-decoration: underline; }
                    .math-inline { white-space: normal; max-width: 100%; }
                    .math-display { margin: 14px 0; padding: 8px 10px; background: #f8fafc; border-left: 3px solid #bfdbfe; overflow-x: auto; }
                    td .math-display, th .math-display { margin: 6px 0; padding: 4px 6px; }
                    td .math-inline mjx-container, th .math-inline mjx-container,
                    td mjx-container[display="false"], th mjx-container[display="false"] {
                        white-space: normal !important;
                        max-width: 100%;
                        overflow-wrap: anywhere;
                    }
                    td mjx-container[display="true"], th mjx-container[display="true"] {
                        max-width: 100%;
                        overflow-x: auto;
                        overflow-y: hidden;
                    }
                    td mjx-container, th mjx-container {
                        font-size: 0.94em !important;
                    }
                    
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
                    
                    .table-wrap { width: 100%; overflow: hidden; margin: 15px 0; }
                    table, .pdf-table { border-collapse: collapse; width: 100%; max-width: 100%; border: 1px solid #e2e8f0; font-size: 13px; table-layout: fixed; }
                    thead { display: table-header-group; }
                    tbody { display: table-row-group; }
                    tr { break-inside: avoid; page-break-inside: avoid; }
                    th, td { border: 1px solid #e2e8f0; padding: 9px 10px; text-align: left; vertical-align: top; white-space: normal; word-break: break-word; overflow-wrap: anywhere; line-height: 1.55; }
                    th { background: #f8fafc; font-weight: 700; }
                    ul, ol { padding-left: 24px; margin: 10px 0; }
                    p { margin: 12px 0; }
                    img { max-width: 100%; height: auto; border-radius: 8px; }
                    .footer { margin-top: auto; padding-top: 20px; border-top: 1px solid #f1f5f9; text-align: right; font-size: 11px; color: #94a3b8; }
                    @page { margin: 10mm; }
                    @media print { 
                        html, body { background: #fff; margin: 0; padding: 0; }
                        .page { box-shadow: none; padding: 24px; margin: 0 auto; width: 100%; max-width: 185mm; }
                        .table-wrap { overflow: hidden; }
                        table, .pdf-table { width: 100%; min-width: 0; max-width: 100%; table-layout: fixed; font-size: 12px; }
                    }
                </style></head><body>
                    ${groups.map((group, idx) => `
                        <div class="page">
                            <div class="header">
                                <div class="title">第 ${idx + 1} 轮对话</div>
                                <div class="platform">${AI_NAME}</div>
                                <div class="ver">AI Chat Helper Exporter v1.6.0</div>
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
                                        <div class="text">${renderMarkdownToHtmlForPdf(m.__displayText)}</div>
                                    </div>
                                `).join('')}
                            </div>
                            <div class="footer">Exported via AI-Chat-Helper • ${new Date().toLocaleString()}</div>
                        </div>
                    `).join('')}
                    <script>
                        window.MathJax = {
                            tex: { inlineMath: [['\\\\(', '\\\\)'], ['$', '$']], displayMath: [['\\\\[', '\\\\]'], ['$$', '$$']] },
                            chtml: { linebreaks: { automatic: true, width: 'container' } },
                            svg: { linebreaks: { automatic: true, width: 'container' } },
                            options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'] }
                        };
                    </script>
                    <script src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
                    <script>
                        (function () {
                            // 避免浏览器打印页脚显示 about:blank
                            try {
                                var openerHref = window.opener && window.opener.location ? window.opener.location.href : '';
                                if (openerHref) window.history.replaceState(null, document.title, openerHref);
                            } catch (e) {}
                            function safePrint() {
                                setTimeout(function () { window.print(); }, 160);
                            }
                            function run() {
                                if (window.MathJax && typeof window.MathJax.typesetPromise === 'function') {
                                    window.MathJax.typesetPromise().then(safePrint).catch(safePrint);
                                } else {
                                    safePrint();
                                }
                            }
                            if (document.readyState === 'complete') run();
                            else window.addEventListener('load', run, { once: true });
                        })();
                    </script>
                </body></html>`;
                win.document.write(html);
                win.document.close();
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
            await openMessagePreviewExportModal({
                headerTitle: '导出当前对话',
                loader: async () => {
                    const result = await getAllMessages();
                    return {
                        messages: Array.isArray(result) ? result : (result?.messages || []),
                        source: Array.isArray(result) ? 'DOM' : (result?.source || 'DOM'),
                        deepseekMeta: isDeepSeek ? deepseekLastSessionMeta : null
                    };
                }
            });
        }

        const toggleSettingsPopup = (e) => {
            const now = Date.now();
            if (now - lastToggleSettingsAt < 180) return;
            lastToggleSettingsAt = now;
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            const isVisible = popup.style.opacity === '1';
            
            if (isVisible) {
                hidePopup();
                hideExportMenu();
            } else {
                const rect = btn.getBoundingClientRect();
                const margin = 8;
                const sideGap = 10;
                const popupWidth = 220;
                const popupHeight = Math.max(180, popup.offsetHeight || 280);
                const leftSide = rect.left - popupWidth - sideGap;
                const rightSide = rect.right + sideGap;
                const canUseLeft = leftSide >= margin;
                const canUseRight = rightSide + popupWidth <= window.innerWidth - margin;
                const openDirection = canUseLeft ? 'left' : (canUseRight ? 'right' : (rect.left > (window.innerWidth / 2) ? 'left' : 'right'));
                const desiredLeft = openDirection === 'left' ? leftSide : rightSide;
                const desiredTop = rect.top + ((rect.height - popupHeight) / 2);
                const clampedLeft = Math.max(margin, Math.min(window.innerWidth - popupWidth - margin, desiredLeft));
                const clampedTop = Math.max(margin, Math.min(window.innerHeight - popupHeight - margin, desiredTop));
                const hiddenTransform = openDirection === 'left'
                    ? 'translateX(10px) scale(0.95)'
                    : 'translateX(-10px) scale(0.95)';
                popup.style.left = clampedLeft + 'px';
                popup.style.top = clampedTop + 'px';
                popup.dataset.openDirection = openDirection;
                popup.style.transform = hiddenTransform;
                void popup.offsetHeight;
                popup.style.opacity = '1';
                popup.style.pointerEvents = 'auto';
                popup.style.transform = 'translateX(0) scale(1)';
                hideExportMenu();
            }
        };
        btn.addEventListener('click', toggleSettingsPopup);

        const isWithinSettingsUi = (target) => {
            if (!target || !(target instanceof Element)) return false;
            if (btn.contains(target)) return true;
            if (popup.contains(target)) return true;
            if (exportMenu.contains(target)) return true;
            if (nodeSettingsMenu.contains(target)) return true;
            if (readingLineMenu.contains(target)) return true;
            return false;
        };

        document.addEventListener('pointerdown', (e) => {
            if (isWithinSettingsUi(e.target)) return;
            hidePopup();
            hideExportMenu();
            hideNodeSettingsMenu();
            hideReadingLineMenu();
        }, true);

        // 收起逻辑实现
        function applyAutoCollapse() {
            if (!autoCollapse) return;
            if (isQwen) {
                const sidebar = document.querySelector("#new-nav-tab-wrapper");
                if (sidebar) {
                    const width = sidebar.getBoundingClientRect().width || 0;
                    const isExpanded = !sidebar.classList.contains('!w-0') && width > 40;
                    if (isExpanded) {
                        const icon = sidebar.querySelector('span[data-icon-type="qwpcicon-sidebarLeft"]');
                        const toggleBtn = (icon ? icon.closest('button') : null)
                            || sidebar.querySelector('button[aria-label*="收起"], button[title*="收起"], button[class*="sidebar"]')
                            || document.querySelector('button[aria-label*="收起侧边栏"], button[title*="收起侧边栏"], button[aria-label*="侧边栏"], button[title*="侧边栏"]');

                        if (toggleBtn) {
                            toggleBtn.click();
                        } else {
                            sidebar.classList.add('!w-0', 'basis-0', '!min-w-0');
                        }
                    }
                }
                return;
            }
            if (!isDoubao) return;

            const sidebar = document.querySelector('nav[data-testid="chat_route_layout_leftside_nav"]');
            if (!sidebar) return;

            const cls = String(sidebar.className || '');
            const isExpandedByClass = /left-side__expand/i.test(cls);
            const width = sidebar.getBoundingClientRect().width || 0;
            const isExpanded = isExpandedByClass || width > 120;
            if (!isExpanded) return;

            const dispatchSmartClick = (el) => {
                if (!(el instanceof HTMLElement)) return false;
                try {
                    ['pointerdown', 'mousedown', 'mouseup', 'click'].forEach((type) => {
                        el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
                    });
                    return true;
                } catch (_) {
                    try {
                        el.click();
                        return true;
                    } catch (__){}
                }
                return false;
            };

            const directToggleBtn = document.querySelector('[data-testid="siderbar_close_btn"], [data-testid="sidebar_close_btn"]');
            if (directToggleBtn && isElementVisiblyRenderable(directToggleBtn) && dispatchSmartClick(directToggleBtn)) {
                return;
            }

            const candidateSelector = [
                '[data-testid="siderbar_close_btn"]',
                '[data-testid="sidebar_close_btn"]',
                '[data-testid="chat_header_fold_sidebar_button"]',
                '[data-testid="chat_header_sidebar_button"]',
                '[data-testid*="fold_sidebar"]',
                '[data-testid*="sidebar_fold"]',
                '[data-testid*="collapse_sidebar"]',
                'button[aria-label*="收起侧边栏"]',
                'button[title*="收起侧边栏"]',
                'button[aria-label*="侧边栏"]',
                'button[title*="侧边栏"]',
                'div[role="button"][aria-label*="收起侧边栏"]',
                'div[role="button"][title*="收起侧边栏"]',
                'div[role="button"][aria-label*="侧边栏"]',
                'div[role="button"][title*="侧边栏"]'
            ].join(', ');

            const candidates = Array.from(document.querySelectorAll(candidateSelector))
                .filter((el) => el instanceof HTMLElement)
                .filter((el) => isElementVisiblyRenderable(el));

            if (candidates.length) {
                candidates.sort((a, b) => {
                    const ra = a.getBoundingClientRect();
                    const rb = b.getBoundingClientRect();
                    const sa = (ra.top <= 180 ? 1000 : 0) + (ra.left >= window.innerWidth * 0.45 ? 500 : 0);
                    const sb = (rb.top <= 180 ? 1000 : 0) + (rb.left >= window.innerWidth * 0.45 ? 500 : 0);
                    return sb - sa;
                });
                if (dispatchSmartClick(candidates[0])) return;
            }

            // 兜底：切换容器状态类（一次性），不做持续样式锁定。
            const expandClass = String(sidebar.className || '').split(/\s+/).find((c) => /left-side__expand/i.test(c));
            if (expandClass) {
                const collapseClass = expandClass.replace(/expand/i, 'collapse');
                sidebar.classList.remove(expandClass);
                if (collapseClass && collapseClass !== expandClass) {
                    sidebar.classList.add(collapseClass);
                }
            }
        }

        function scheduleAutoCollapseRetry() {
            if (!autoCollapse) return;
            [0, 160, 420, 900, 1600].forEach((delay) => {
                setTimeout(() => {
                    if (!autoCollapse) return;
                    applyAutoCollapse();
                }, delay);
            });
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
            if (anchor === buttonHost || anchor === btn) return false;
            const container = anchor.parentElement;

            if (buttonHost.parentElement !== container) {
                container.appendChild(buttonHost);
            }

            const anchorRect = anchor.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();
            const hostWidth = Math.max(32, Math.round(buttonHost.getBoundingClientRect().width || 32));
            const gap = 8;
            const minLeft = 8;
            const maxLeft = Math.max(minLeft, Math.round(containerRect.width - hostWidth - 8));

            let left = Math.round(anchorRect.right - containerRect.left + gap);
            if (left > maxLeft) {
                left = Math.round(anchorRect.left - containerRect.left - hostWidth - gap);
            }
            left = Math.max(minLeft, Math.min(left, maxLeft));

            buttonHost.style.position = 'absolute';
            buttonHost.style.left = `${left}px`;
            buttonHost.style.right = 'auto';
            buttonHost.style.top = `${Math.round(anchorRect.top - containerRect.top)}px`;
            buttonHost.style.margin = '0';
            buttonHost.style.zIndex = '10060';
            return true;
        }

        function getQwenUploadRecordButton() {
            const candidates = Array.from(document.querySelectorAll('button[aria-label="上传记录"], button[aria-label="实时记录"]'));
            if (!candidates.length) return null;
            const filtered = candidates.filter((btn) => {
                if (!btn || !btn.isConnected) return false;
                if (btn.closest('#new-nav-tab-wrapper, aside')) return false;
                const rect = btn.getBoundingClientRect();
                return rect.top >= 0 && rect.top < Math.max(220, window.innerHeight * 0.35);
            });
            if (!filtered.length) return null;
            filtered.sort((a, b) => {
                const ra = a.getBoundingClientRect();
                const rb = b.getBoundingClientRect();
                return rb.right - ra.right;
            });
            return filtered[0];
        }

        function getQwenUploadRecordAnchor() {
            const btn = getQwenUploadRecordButton();
            if (!btn) return null;
            const shell = btn.closest('[class*="capsuleTransitionShell"], [class*="moreButtonMotionShell"]')
                || btn.closest('[class*="capsuleTransitionItem"], [class*="moreButtonMotionItem"]')
                || btn;
            const container = shell.parentElement || btn.parentElement;
            if (!container) return null;
            return { button: btn, shell, container };
        }

        function placeSettingsUnderRail() {
            const rail = document.getElementById('ai-nodes-nav-wrapper');
            if (!rail || !rail.isConnected) return false;

            if (buttonHost.parentElement !== rail) {
                rail.appendChild(buttonHost);
            }
            if (fallbackHost.isConnected) fallbackHost.remove();

            const railRect = rail.getBoundingClientRect();
            const hostWidth = Math.max(32, Math.round(buttonHost.offsetWidth || 32));
            const hostHeight = Math.max(32, Math.round(buttonHost.offsetHeight || 32));
            const edgePadding = 8;
            const belowGap = 10;
            const railRectAdjusted = rail.getBoundingClientRect();
            const desiredLeftViewport = railRectAdjusted.left + (railRectAdjusted.width - hostWidth) / 2;
            const clampedLeftViewport = Math.max(
                edgePadding,
                Math.min(window.innerWidth - hostWidth - edgePadding, desiredLeftViewport)
            );
            const localLeft = Math.round(clampedLeftViewport - railRectAdjusted.left);
            const localTop = Math.round(railRectAdjusted.height + belowGap);

            buttonHost.style.position = 'absolute';
            buttonHost.style.left = `${localLeft}px`;
            buttonHost.style.top = `${localTop}px`;
            buttonHost.style.right = 'auto';
            buttonHost.style.margin = '0';
            buttonHost.style.transform = 'none';
            buttonHost.style.zIndex = '10060';
            return true;
        }

        // 注入逻辑：统一基于轨道定位
        function attemptInjection() {
            return placeSettingsUnderRail();
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
            const hostVisible = isElementVisiblyRenderable(buttonHost);
            const rail = document.getElementById('ai-nodes-nav-wrapper');
            if (!buttonHost.isConnected || !hostVisible || !rail || buttonHost.parentElement !== rail) {
                attemptInjection();
                return;
            }
            placeSettingsUnderRail();
        };

        let ensureTimer = null;
        const scheduleEnsureInjected = () => {
            if (ensureTimer) return;
            ensureTimer = setTimeout(() => {
                ensureTimer = null;
                ensureInjected();
            }, 0);
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
        window.addEventListener('resize', ensureInjected, { passive: true });
        window.addEventListener('scroll', ensureInjected, { passive: true });

        if (autoCollapse) {
            scheduleAutoCollapseRetry();
        }
    }


    let appBootstrapped = false;
    function bootstrapApp() {
        if (appBootstrapped || !document.body) return;
        appBootstrapped = true;

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        window.addEventListener('resize', () => {
            render();
        });

        window.addEventListener('scroll', handleConversationScrollEvent, true);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                requestAnimationFrame(() => update());
            }
        });

        init();
        startRealtimeUpdateFallback();
        bindComposerRealtimeTriggers();
        setTimeout(() => {
            injectSettings();
        }, 0);
    }

    if (document.body) {
        bootstrapApp();
    } else {
        document.addEventListener('DOMContentLoaded', bootstrapApp, { once: true });
        const waitForBody = setInterval(() => {
            if (!document.body) return;
            clearInterval(waitForBody);
            bootstrapApp();
        }, 50);
    }
})();










