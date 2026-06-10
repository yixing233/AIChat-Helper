// ==UserScript==
// @name         Claude Search Test
// @namespace    https://example.com/
// @version      0.1.0
// @description  Claude 对话 DOM 搜索测试：去重聚合命中，避免重复结果泛滥
// @match        *://claude.ai/chat/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const host = String(window.location.hostname || '');
    const path = String(window.location.pathname || '');
    const isClaude = /^claude\.ai$/i.test(host) && /^\/chat(?:\/[0-9a-f-]{36})?\/?$/i.test(path);
    if (!isClaude) return;

    const normalize = (text) => String(text || '')
        .replace(/[\u200B-\u200D\uFEFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

    const shortText = (text, n = 120) => {
        const t = normalize(text);
        return t.length > n ? `${t.slice(0, n)}...` : t;
    };
    const textFingerprint = (text) => normalize(text).toLowerCase().slice(0, 240);

    const getMainRoot = () => document.querySelector('#main-content') || document.querySelector('main') || document.body;

    function getTurnContainers(root) {
        if (!(root instanceof Element)) return [];
        const directTurns = Array.from(root.querySelectorAll(':scope > div[data-test-render-count]'));
        if (directTurns.length) return directTurns;
        return Array.from(root.querySelectorAll('div[data-test-render-count]'));
    }

    function extractEntriesFromDom() {
        const root = getMainRoot();
        if (!root) return [];

        const entries = [];
        const seen = new Set();

        const add = (el, roleHint = '') => {
            if (!(el instanceof HTMLElement)) return;
            if (!root.contains(el)) return;
            if (seen.has(el)) return;
            const text = normalize(el.innerText || '');
            if (!text || text.length < 2) return;
            const fp = textFingerprint(text);
            if (!fp) return;
            const rect = el.getBoundingClientRect();
            const area = Math.max(1, (rect.width || 0) * (rect.height || 0));

            // 如果是包裹型大容器（明显包含已有消息块），直接跳过，避免重复命中。
            for (const ex of entries) {
                if (!(ex?.element instanceof HTMLElement)) continue;
                if (el.contains(ex.element)) {
                    const exText = String(ex.text || '');
                    if (exText && text.includes(exText.slice(0, Math.min(80, exText.length)))) return;
                }
            }

            // 文本指纹去重：保留面积更小的元素，通常更接近真正消息块。
            const sameIdx = entries.findIndex((x) => x.fp === fp);
            if (sameIdx >= 0) {
                const old = entries[sameIdx];
                if ((old.area || 0) <= area) return;
                entries.splice(sameIdx, 1);
            }

            seen.add(el);
            entries.push({
                element: el,
                role: roleHint || 'unknown',
                text,
                fp,
                area
            });
        };

        const turns = getTurnContainers(root);
        turns.forEach((turn) => {
            if (!(turn instanceof HTMLElement)) return;

            // 用户消息：精确使用 data-testid="user-message"
            const userMessage = turn.querySelector('[data-testid="user-message"]');
            if (userMessage instanceof HTMLElement) {
                add(userMessage, 'user');
            }

            // 助手消息：精确使用 .font-claude-response
            const assistantResp = turn.querySelector('.font-claude-response');
            if (assistantResp instanceof HTMLElement) {
                const txt = normalize(assistantResp.innerText || '');
                if (txt && !/\bClaude responded:\b/i.test(txt)) {
                    add(assistantResp, 'assistant');
                }
            }
        });

        // 角色冲突清理：同文本在 user/assistant 都存在时，优先保留 user。
        const userFp = new Set(
            entries
                .filter((e) => e.role === 'user')
                .map((e) => String(e.fp || ''))
                .filter(Boolean)
        );
        return entries.filter((e) => !(e.role === 'assistant' && userFp.has(String(e.fp || ''))));
    }

    function buildHits(keyword) {
        const term = normalize(keyword).toLowerCase();
        if (!term) {
            return { rows: [], stats: { rawEntryCount: 0, groupedCount: 0, finalCount: 0 } };
        }

        const entries = extractEntriesFromDom();
        const hits = [];

        entries.forEach((entry, idx) => {
            const text = String(entry.text || '');
            const lower = text.toLowerCase();
            let from = 0;
            let hitNo = 0;
            while (from <= lower.length) {
                const pos = lower.indexOf(term, from);
                if (pos < 0) break;
                hitNo += 1;
                const s = Math.max(0, pos - 24);
                const e = Math.min(text.length, pos + term.length + 36);
                const snippet = `${s > 0 ? '...' : ''}${normalize(text.slice(s, e))}${e < text.length ? '...' : ''}`;
                hits.push({
                    entryIndex: idx + 1,
                    hitNo,
                    role: entry.role,
                    element: entry.element,
                    snippet,
                    position: pos
                });
                from = pos + term.length;
            }
        });

        // 去重策略1：同一个消息块(元素)聚合，只保留一个条目，并统计命中次数。
        const grouped = new Map();
        hits.forEach((h) => {
            const key = h.element;
            const cur = grouped.get(key);
            if (!cur) {
                grouped.set(key, {
                    element: h.element,
                    role: h.role,
                    entryIndex: h.entryIndex,
                    count: 1,
                    snippet: h.snippet
                });
                return;
            }
            cur.count += 1;
        });
        const byElement = Array.from(grouped.values()).sort((a, b) => a.entryIndex - b.entryIndex);

        // 去重策略2：跨元素文本指纹去重（用户/助手都命中同一段时，只保留更精准块）。
        const mergedByText = new Map();
        byElement.forEach((row) => {
            const fp = textFingerprint(row.snippet || '');
            if (!fp) return;
            const rect = row.element?.getBoundingClientRect?.();
            const area = rect ? Math.max(1, (rect.width || 0) * (rect.height || 0)) : Number.MAX_SAFE_INTEGER;
            const old = mergedByText.get(fp);
            if (!old) {
                mergedByText.set(fp, { ...row, _area: area });
                return;
            }
            const oldArea = Number(old._area || Number.MAX_SAFE_INTEGER);
            // 优先更小面积；面积接近时优先命中次数更多。
            if (area < oldArea * 0.92 || (Math.abs(area - oldArea) <= oldArea * 0.08 && row.count > old.count)) {
                mergedByText.set(fp, { ...row, _area: area });
            }
        });

        let rows = Array.from(mergedByText.values())
            .sort((a, b) => a.entryIndex - b.entryIndex)
            .map(({ _area, ...rest }) => rest);

        const userSnippets = rows
            .filter((r) => r.role === 'user')
            .map((r) => textFingerprint(r.snippet || ''))
            .filter(Boolean);
        rows = rows.filter((r) => {
            if (r.role !== 'assistant') return true;
            const fp = textFingerprint(r.snippet || '');
            if (!fp) return true;
            return !userSnippets.some((u) => u && (u.includes(fp) || fp.includes(u)));
        });

        return {
            rows,
            stats: {
                rawEntryCount: entries.length,
                groupedCount: byElement.length,
                finalCount: rows.length
            }
        };
    }

    function jumpToElement(el) {
        if (!(el instanceof Element)) return;
        try {
            el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        } catch (_) {
            el.scrollIntoView();
        }
    }

    function focusKeywordInElement(el, keyword, occurrenceNo = 1) {
        if (!(el instanceof Element)) return null;
        const term = normalize(keyword);
        if (!term) return null;
        const lowerTerm = term.toLowerCase();
        let hitCount = 0;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                const val = String(node?.nodeValue || '').trim();
                return val ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
        });
        while (walker.nextNode()) {
            const node = walker.currentNode;
            const text = String(node?.nodeValue || '');
            const lower = text.toLowerCase();
            let from = 0;
            while (from <= lower.length) {
                const idx = lower.indexOf(lowerTerm, from);
                if (idx < 0) break;
                hitCount += 1;
                if (hitCount === Math.max(1, Number(occurrenceNo) || 1)) {
                    const range = document.createRange();
                    range.setStart(node, idx);
                    range.setEnd(node, idx + term.length);
                    const sel = window.getSelection();
                    if (sel) {
                        sel.removeAllRanges();
                        sel.addRange(range);
                    }
                    return range;
                }
                from = idx + lowerTerm.length;
            }
        }
        return null;
    }

    function centerRangeInViewport(range) {
        if (!range || typeof range.getBoundingClientRect !== 'function') return;
        const rect = range.getBoundingClientRect();
        if (!Number.isFinite(rect.top) || !Number.isFinite(rect.height)) return;
        const centerY = rect.top + rect.height / 2;
        const delta = centerY - (window.innerHeight / 2);
        if (Math.abs(delta) < 2) return;
        window.scrollBy({ top: delta, behavior: 'smooth' });
    }

    function createPanel() {
        const wrap = document.createElement('div');
        wrap.style.cssText = [
            'position:fixed',
            'right:16px',
            'bottom:16px',
            'width:360px',
            'max-height:68vh',
            'z-index:2147483647',
            'background:rgba(255,255,255,.95)',
            'border:1px solid #bfdbfe',
            'border-radius:12px',
            'box-shadow:0 12px 36px rgba(15,23,42,.2)',
            'display:flex',
            'flex-direction:column',
            'overflow:hidden',
            'font:12px/1.4 -apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Microsoft YaHei,sans-serif'
        ].join(';');

        wrap.innerHTML = `
            <div style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#1e3a8a;">Claude 搜索测试（去重版）</div>
            <div style="padding:10px;display:flex;gap:8px;">
                <input id="cst-input" type="text" placeholder="输入关键词..." style="flex:1;border:1px solid #bfdbfe;border-radius:8px;padding:7px 9px;outline:none;">
                <button id="cst-btn" type="button" style="border:1px solid #2563eb;background:#2563eb;color:#fff;border-radius:8px;padding:7px 10px;cursor:pointer;font-weight:700;">搜索</button>
            </div>
            <div id="cst-status" style="padding:0 10px 8px;color:#64748b;">待搜索</div>
            <div id="cst-list" style="padding:0 10px 10px;overflow:auto;"></div>
        `;
        document.body.appendChild(wrap);

        const input = wrap.querySelector('#cst-input');
        const btn = wrap.querySelector('#cst-btn');
        const status = wrap.querySelector('#cst-status');
        const list = wrap.querySelector('#cst-list');
        let lastKeyword = '';

        const render = (rows) => {
            if (!Array.isArray(rows) || !rows.length) {
                list.innerHTML = '<div style="padding:8px;color:#64748b;">没有命中</div>';
                return;
            }
            list.innerHTML = '';
            rows.forEach((row, i) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.style.cssText = 'width:100%;text-align:left;border:1px solid #dbeafe;background:#fff;border-radius:10px;padding:8px;margin:0 0 6px;cursor:pointer;';
                item.innerHTML = `
                    <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:4px;">
                        <span style="font-weight:700;color:${row.role === 'user' ? '#1d4ed8' : '#0f766e'};">${row.role === 'user' ? '用户' : '助手'}</span>
                        <span style="color:#64748b;">#${i + 1} · 命中 ${row.count} 次</span>
                    </div>
                    <div style="color:#0f172a;word-break:break-word;">${shortText(row.snippet, 180)}</div>
                `;
                item.addEventListener('click', () => {
                    jumpToElement(row.element);
                    setTimeout(() => {
                        const range = focusKeywordInElement(row.element, lastKeyword, 1);
                        if (range) {
                            centerRangeInViewport(range);
                            setTimeout(() => centerRangeInViewport(range), 180);
                        }
                    }, 140);
                });
                list.appendChild(item);
            });
        };

        const run = () => {
            const keyword = normalize(input.value || '');
            if (!keyword) {
                status.textContent = '请输入关键词';
                list.innerHTML = '';
                return;
            }
            lastKeyword = keyword;
            status.textContent = '搜索中...';
            const result = buildHits(keyword);
            const rows = Array.isArray(result?.rows) ? result.rows : [];
            const s = result?.stats || {};
            status.textContent = `消息块 ${s.rawEntryCount || 0} -> 元素去重 ${s.groupedCount || 0} -> 文本去重 ${s.finalCount || 0}`;
            render(rows);
        };

        btn.addEventListener('click', run);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                run();
            }
        });
    }

    createPanel();
})();
