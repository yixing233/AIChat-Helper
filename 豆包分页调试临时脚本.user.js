// ==UserScript==
// @name         豆包分页调试临时脚本
// @namespace    https://doubao.com/
// @version      0.1.0
// @description  临时抓取 recent_conv 分页与 mcs/list 请求响应，辅助定位 20 条后不翻页问题
// @author       temp
// @match        https://www.doubao.com/*
// @run-at       document-start
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
    'use strict';

    const MAX_BODY_PREVIEW = 200000;
    const MAX_RECENT_CONV_KEEP = 12;
    const MAX_MCS_LIST_KEEP = 20;
    const MAX_LOG_KEEP = 600;

    const state = {
        startedAt: new Date().toISOString(),
        recentConv: [],
        mcsList: [],
        logs: []
    };

    function now() {
        return new Date().toISOString();
    }

    function safeParse(text) {
        if (typeof text !== 'string') return null;
        try {
            return JSON.parse(text);
        } catch (_) {
            return null;
        }
    }

    function trimText(text, max = MAX_BODY_PREVIEW) {
        const s = typeof text === 'string' ? text : String(text || '');
        if (s.length <= max) return s;
        return s.slice(0, max) + '\n...<trimmed>';
    }

    function normHeaders(headersLike) {
        const out = {};
        try {
            if (!headersLike) return out;
            if (headersLike instanceof Headers) {
                headersLike.forEach((v, k) => { out[String(k).toLowerCase()] = String(v); });
                return out;
            }
            if (Array.isArray(headersLike)) {
                headersLike.forEach((pair) => {
                    if (!Array.isArray(pair) || pair.length < 2) return;
                    out[String(pair[0]).toLowerCase()] = String(pair[1]);
                });
                return out;
            }
            if (typeof headersLike === 'object') {
                Object.entries(headersLike).forEach(([k, v]) => {
                    out[String(k).toLowerCase()] = String(v);
                });
            }
        } catch (_) {
            // ignore
        }
        return out;
    }

    function redactHeaders(headers) {
        const sensitive = new Set([
            'cookie',
            'authorization',
            'x-secsdk-csrf-token',
            'x-tt-passport-csrf-token',
            'x-ms-token',
            'ms-token'
        ]);
        const out = {};
        Object.entries(headers || {}).forEach(([k, v]) => {
            if (sensitive.has(String(k).toLowerCase())) {
                out[k] = '***';
            } else {
                out[k] = v;
            }
        });
        return out;
    }

    function isRecentConvUrl(url) {
        try {
            const u = new URL(url, location.origin);
            return /\/im\/chain\/recent_conv$/i.test(u.pathname);
        } catch (_) {
            return false;
        }
    }

    function isMcsListUrl(url) {
        try {
            const u = new URL(url, location.origin);
            return /(^|\.)mcs\.doubao\.com$/i.test(u.hostname) && /\/list$/i.test(u.pathname);
        } catch (_) {
            return false;
        }
    }

    function pickConversationSample(respJson) {
        const payload = respJson?.downlink_body?.pull_recent_conv_chain_downlink_body
            || respJson?.downlink_body?.pull_recent_conv_downlink_body
            || {};
        const list = Array.isArray(payload?.conversation_list)
            ? payload.conversation_list
            : (Array.isArray(payload?.conversations) ? payload.conversations : []);

        return {
            status_code: respJson?.status_code,
            status_desc: respJson?.status_desc,
            has_more: payload?.has_more,
            next_conv_version: payload?.next_conv_version,
            conv_version: payload?.conv_version,
            count: list.length,
            first: list[0] || null,
            last: list[list.length - 1] || null
        };
    }

    function pushLog(type, record) {
        const line = {
            time: now(),
            type,
            ...record
        };
        state.logs.push(line);
        if (state.logs.length > MAX_LOG_KEEP) state.logs.shift();
        console.log('[DoubaoPageDebug]', line);
    }

    function maybeStoreRecentConv(record) {
        state.recentConv.push(record);
        if (state.recentConv.length > MAX_RECENT_CONV_KEEP) {
            state.recentConv = state.recentConv.slice(-MAX_RECENT_CONV_KEEP);
        }
    }

    function maybeStoreMcsList(record) {
        state.mcsList.push(record);
        if (state.mcsList.length > MAX_MCS_LIST_KEEP) {
            state.mcsList = state.mcsList.slice(-MAX_MCS_LIST_KEEP);
        }
    }

    function buildRecentConvTimeline() {
        return (Array.isArray(state.recentConv) ? state.recentConv : []).map((rec, idx) => {
            const req = rec?.requestBodyJson?.uplink_body?.pull_recent_conv_chain_uplink_body || {};
            const rsp = rec?.responseSummary || {};
            return {
                index: idx + 1,
                transport: rec?.transport || '',
                method: rec?.method || '',
                status: rec?.status,
                direction: req?.direction,
                limit: req?.limit,
                conv_version: req?.conv_version,
                pc_pin_query_type: req?.option?.pc_pin_query_type,
                need_coco_conversation: req?.option?.need_coco_conversation,
                need_coco_bot: req?.option?.need_coco_bot,
                next_conv_version: rsp?.next_conv_version,
                has_more: rsp?.has_more,
                count: rsp?.count
            };
        });
    }

    function serializeResult() {
        return JSON.stringify({
            note: '把这份 JSON 发给修复脚本的人即可',
            startedAt: state.startedAt,
            exportedAt: now(),
            recentConvCaptured: state.recentConv,
            mcsListCaptured: state.mcsList,
            recentConvTimeline: buildRecentConvTimeline(),
            logCount: state.logs.length,
            logsPreview: state.logs.slice(-80)
        }, null, 2);
    }

    function copyResult() {
        const text = serializeResult();
        let copied = false;

        try {
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(text);
                copied = true;
            }
        } catch (_) {
            // ignore
        }

        if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(() => {
                alert('已复制调试结果到剪贴板');
            }).catch(() => {
                prompt('复制失败，请手动复制：', text);
            });
            return;
        }

        if (copied) {
            alert('已复制调试结果到剪贴板');
        } else {
            prompt('复制失败，请手动复制：', text);
        }
    }

    function installFloatingButton() {
        const create = () => {
            if (document.getElementById('db-page-debug-copy-btn')) return;
            const btn = document.createElement('button');
            btn.id = 'db-page-debug-copy-btn';
            btn.textContent = '导出分页调试数据 (0)';
            btn.style.cssText = [
                'position:fixed',
                'right:16px',
                'bottom:16px',
                'z-index:999999',
                'padding:10px 14px',
                'border:none',
                'border-radius:10px',
                'background:#0f172a',
                'color:#fff',
                'font-size:12px',
                'cursor:pointer',
                'box-shadow:0 8px 24px rgba(0,0,0,0.25)'
            ].join(';');
            btn.onclick = copyResult;
            document.body.appendChild(btn);

            setInterval(() => {
                const n = Array.isArray(state.recentConv) ? state.recentConv.length : 0;
                btn.textContent = `导出分页调试数据 (${n})`;
            }, 600);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', create, { once: true });
        } else {
            create();
        }
    }

    function buildRequestBodyText(body) {
        if (typeof body === 'string') return body;
        if (body == null) return '';
        try {
            return String(body);
        } catch (_) {
            return '';
        }
    }

    function captureFetch() {
        const rawFetch = window.fetch;
        window.fetch = async function (input, init) {
            const reqUrl = typeof input === 'string' ? input : (input?.url || '');
            const method = String(init?.method || input?.method || 'GET').toUpperCase();
            const headers = redactHeaders(normHeaders(init?.headers || input?.headers));
            const bodyText = buildRequestBodyText(init?.body);

            const targetRecent = isRecentConvUrl(reqUrl) && method === 'POST';
            const targetMcs = isMcsListUrl(reqUrl);

            const resp = await rawFetch.apply(this, arguments);

            if (!targetRecent && !targetMcs) return resp;

            let responseText = '';
            let responseJson = null;
            try {
                const cloned = resp.clone();
                responseText = await cloned.text();
                responseJson = safeParse(responseText);
            } catch (_) {
                // ignore
            }

            const baseRecord = {
                transport: 'fetch',
                method,
                url: reqUrl,
                status: resp.status,
                requestHeaders: headers,
                requestBodyText: trimText(bodyText),
                requestBodyJson: safeParse(bodyText),
                responseBodyText: trimText(responseText),
                responseBodyJson: responseJson
            };

            if (targetRecent) {
                const record = {
                    ...baseRecord,
                    responseSummary: responseJson ? pickConversationSample(responseJson) : null
                };
                maybeStoreRecentConv(record);
                pushLog('recent_conv', {
                    status: resp.status,
                    url: reqUrl,
                    summary: record.responseSummary
                });
            }

            if (targetMcs) {
                maybeStoreMcsList(baseRecord);
                pushLog('mcs_list', {
                    status: resp.status,
                    url: reqUrl,
                    method
                });
            }

            return resp;
        };
    }

    function captureXhr() {
        const rawOpen = XMLHttpRequest.prototype.open;
        const rawSend = XMLHttpRequest.prototype.send;
        const rawSetHeader = XMLHttpRequest.prototype.setRequestHeader;

        XMLHttpRequest.prototype.open = function (method, url) {
            this.__dbDbgMethod = String(method || 'GET').toUpperCase();
            this.__dbDbgUrl = url ? new URL(url, location.origin).toString() : '';
            this.__dbDbgHeaders = {};
            this.__dbDbgBody = '';
            return rawOpen.apply(this, arguments);
        };

        XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
            try {
                if (name) this.__dbDbgHeaders[String(name).toLowerCase()] = String(value);
            } catch (_) {
                // ignore
            }
            return rawSetHeader.apply(this, arguments);
        };

        XMLHttpRequest.prototype.send = function (body) {
            this.__dbDbgBody = buildRequestBodyText(body);
            const targetRecent = isRecentConvUrl(this.__dbDbgUrl) && this.__dbDbgMethod === 'POST';
            const targetMcs = isMcsListUrl(this.__dbDbgUrl);

            if (targetRecent || targetMcs) {
                this.addEventListener('loadend', function () {
                    let responseText = '';
                    let responseJson = null;
                    try {
                        responseText = typeof this.responseText === 'string' ? this.responseText : '';
                        responseJson = safeParse(responseText);
                    } catch (_) {
                        // ignore
                    }

                    const baseRecord = {
                        transport: 'xhr',
                        method: this.__dbDbgMethod,
                        url: this.__dbDbgUrl,
                        status: this.status,
                        requestHeaders: redactHeaders(this.__dbDbgHeaders || {}),
                        requestBodyText: trimText(this.__dbDbgBody || ''),
                        requestBodyJson: safeParse(this.__dbDbgBody || ''),
                        responseBodyText: trimText(responseText),
                        responseBodyJson: responseJson
                    };

                    if (targetRecent) {
                        const record = {
                            ...baseRecord,
                            responseSummary: responseJson ? pickConversationSample(responseJson) : null
                        };
                        maybeStoreRecentConv(record);
                        pushLog('recent_conv', {
                            status: this.status,
                            url: this.__dbDbgUrl,
                            summary: record.responseSummary
                        });
                    }

                    if (targetMcs) {
                        maybeStoreMcsList(baseRecord);
                        pushLog('mcs_list', {
                            status: this.status,
                            url: this.__dbDbgUrl,
                            method: this.__dbDbgMethod
                        });
                    }
                });
            }

            return rawSend.apply(this, arguments);
        };
    }

    captureFetch();
    captureXhr();
    installFloatingButton();

    console.log('[DoubaoPageDebug] 临时脚本已启动。请刷新页面，触发列表首屏+下滑分页，再点击右下角“导出分页调试数据”。');
})();
