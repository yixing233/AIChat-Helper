// ==UserScript==
// @name         AI聊天节点导航器
// @namespace    http://tampermonkey.net/
// @version      1.6.0
// @description  支持 ChatGPT、通义千问、豆包、DeepSeek：自动生成对话节点导航、一键导出对话（PDF/Markdown/JSON/CSV/TXT）、节点位置自动同步及对话管理界面。
// @author       xchengb
// @icon         data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMiIgaGVpZ2h0PSIzMiIgdmlld0JveD0iMCAwIDMyIDMyIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIGZpbGw9Im5vbmUiLz48cGF0aCBmaWxsPSIjMDQwMGU2IiBkPSJNMTYgMTlhNi45OSAxNi45OSAwIDAgMS01LjgzMy0zLjEyOWwxLjY2Ni0xLjEwN2E1IDUgMCAwIDAgOC4zMzQgMGwxLjY2NiAxLjEwN0E2Ljk5IDYuOTkgMCAwIDEgMTYgMTl6Ii8+PGNpcmNsZSBjeD0iMjAyMCIgY3k9IjEwIiByPSIyIiBmaWxsPSIjMDQwMGU2Ii8+PGNpcmNsZSBjeD0iMTIiIGN5PSIxMCIgcj0iMiIgZmlsbD0iIzA0MDBlNiIvPjxjaXJjbGUgY3g9IjEyIiBjeT0iMTAiIHI9IjIiIGZpbGw9IiMwNDAwZTYiLz48Y2lyY2xlIGN4PSIxMiIgY3k9IjEwIiByPSIyIiBmaWxsPSIjMDQwMGU2Ii8+PHBhdGggZmlsbD0iIzA0MDBlNiIgZD0iTTE3LjczNiAzMEwxNiAyOWw0LTdoNmEyIDIgMCAwIDAgMi0yVjZhMiAyIDAgMCAwLTItMkg2YTIgMiAwIDAgMC0yIDJ2MTRhMiAyIDAgMCAwIDIgMmg5djJINmE0IDQgMCAwIDEtNC00VjZhNCA0IDAgMCAxIDQtNGgyMGE0IDQgMCAwIDEgNCA0djE0YTQgNCAwIDAgMS00IDRoLTQuODM1eiIvPjwvc3ZnPg==
// @match        *://chatgpt.com/*
// @match        *://tongyi.aliyun.com/*
// @match        *://*.qianwen.com/*
// @match        *://www.doubao.com/*
// @match        *://chat.deepseek.com/*
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const host = window.location.hostname;
    const isChatGPT = host.includes('chatgpt.com');
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
        if (host.includes('chatgpt.com')) {
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
            // 核心修复：直接用 class+attribute 组合选择器锁定用户消息
            // DOM 顺序 = querySelectorAll 返回顺序 = 视觉顺序，归纳一词
            const qItems = document.querySelectorAll('[class*="questionItem"][data-msgid]');
            
            qItems.forEach((el) => {
                // 提取稳定 ID：去掉 -question 后缀，保留纯 UUID
                const rawId = el.getAttribute('data-msgid') || '';
                const id = rawId.replace(/-question$/, '');
                if (!id) return;

                // 提取消息文本
                const textEl = el.querySelector('[class*="bubble"]') || 
                              el.querySelector('[class*="contentBox"]') || el;
                const text = textEl.innerText.trim();
                if (!text) return;

                list.push({
                    id: id,
                    element: textEl, // 修改：高亮气泡容器而非整行背景
                    role: 'user',
                    text: text
                });
            });
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
            // DeepSeek 适配：增加对原生混淆类名（._81e7b5e）的支持，并优先扫描虚拟列表可见区
            const visibleArea = document.querySelector('.ds-virtual-list-visible-items');
            const msgs = visibleArea ? visibleArea.querySelectorAll('._81e7b5e, .ds-message') : document.querySelectorAll('._81e7b5e, .ds-message');
            
            msgs.forEach((el, index) => {
                // 排除 AI 回复：通过类名 _19d617c (通常为用户) 或 AI 专属组件判定
                // 在 DeepSeek 中，._19d617c 通常带在用户消息容器上
                const isUser = el.classList.contains('_19d617c') || (!el.querySelector('.ds-markdown') && !el.querySelector('.ds-think-content'));
                if (!isUser) return; 

                // 优先选取内容气泡 ._72b6158
                const bubbleEl = el.querySelector('._72b6158') || el.querySelector('.ds-message-item--content') || el;
                const text = bubbleEl.innerText.trim();
                
                if (!text || text.length < 2 || text === '深度思考' || text === '联网搜索') return;

                // DeepSeek 的虚拟列表会导致索引跳变，使用文本内容哈希作为稳定 ID
                const id = 'ds-' + hashStr(text.slice(0, 50) + text.length);

                list.push({
                    id: id,
                    element: bubbleEl, // 修改：紧贴 DeepSeek 原生气泡 _72b6158
                    role: 'user',
                    text: text
                });
            });
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

    function jumpToMessage(el, nodeId) {
        let targetEl = el;
        const node = nodesMap.get(nodeId);
        
        // 核心加固：验证 DOM 节点是否被“回收复用” (Virtual List 防抖)
        const isElementValid = (element, expectedNode) => {
            if (!element || !element.isConnected) return false;
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
        }

        // 如果仍然没有找到有效节点（说明目标已彻底不在当前视口内），启动深度搜寻
        if (!targetEl) {
            console.warn(`AI-Chat-Nodes: 目标节点 ${nodeId} 已被回收或不在视野内，启动深度搜寻...`);
            startNodeSearch(nodeId);
            return;
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
            if (isQwen) {
                setTimeout(() => { if(isElementValid(targetEl, node)) executeJump(165); }, 300);
            }
        } else {
            targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        highlightMessage(targetEl);
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

    function getScrollContainer() {
        // 自动探测当前 AI 平台的主聊天滚动容器
        const host = window.location.hostname;
        if (host.includes('qianwen.com') || host.includes('aliyun.com')) {
            const qwenInner = document.querySelector('[class*="chatContent"]') || document.querySelector('[class*="messageList"]');
            if (qwenInner) return qwenInner;
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
                globalTooltip.style.left = (dotRect.left - 15) + 'px';
                globalTooltip.style.transform = 'translate(calc(-100% + 10px), -50%) scale(0.95)';
            } else {
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
            globalTooltip.style.transform = 'translateY(10px) scale(0.95)';
        });

        dot.addEventListener('click', (e) => {
            e.stopPropagation();
            // 直接调用 jumpToMessage 内部包含的寻址与搜寻逻辑
            jumpToMessage(node.element, node.id);
            setActiveDot(dot, node.id);
            scrollDotIntoView(dot);
        });
        return dot;
    }

    /**
     * 启动独立计时器循环搜寻目标节点
     * 每 2 秒触发一次向上平滑滚动，触发平台懒加载
     * 找到节点后自动跳转并停止计时器
     */
    function startNodeSearch(targetId) {
        // 先清理可能存在的旧计时器
        if (searchIntervalId) {
            clearInterval(searchIntervalId);
            searchIntervalId = null;
        }

        let attempts = 0;
        const MAX_ATTEMPTS = 30; // 最多搜寻 30 次（约 60 秒）

        function doSearchTick() {
            // 检查是否已经找到节点
            const targetNode = nodesMap.get(targetId);
            const found = targetNode && targetNode.element && document.body.contains(targetNode.element);

            if (found) {
                clearInterval(searchIntervalId);
                searchIntervalId = null;
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
                clearInterval(searchIntervalId);
                searchIntervalId = null;
                console.warn(` AI-Chat-Nodes: ✗ 搜寻超时 (${MAX_ATTEMPTS} 次)，未找到节点 ${targetId}`);
                return;
            }

            console.log(` AI-Chat-Nodes: 搜寻中 (${attempts}/${MAX_ATTEMPTS})...`);

            // 重新探测滚动容器（容器可能在 SPA 路由后变化）
            const scrollEl = getScrollContainer();
            if (scrollEl && scrollEl !== window && typeof scrollEl.scrollTo === 'function') {
                // 先快速归零再平滑，确保置顶信号被平台感知
                scrollEl.scrollTop = 0;
                setTimeout(() => scrollEl.scrollTo({ top: 0, behavior: 'smooth' }), 100);
            } else {
                document.documentElement.scrollTop = 0;
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }

        // 立即执行第一次
        doSearchTick();
        // 然后每 2 秒一次（给平台足够时间加载消息）
        searchIntervalId = setInterval(doSearchTick, 2000);
    }

    /**
     * 千问专属：加载全部历史消息节点
     * 策略：持续向上滚动直到 scrollTop 稳定为 0（真正到顶），然后刷新全部节点
     * @param {HTMLElement} triggerBtn - 触发按钮（用于显示进度状态）
     */
    function startLoadAllHistory() {
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

            const toast = document.createElement('div');
            toast.style.cssText = `position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(30, 30, 40, 0.92);color:#fff;font-size:13px;padding:14px 28px;border-radius:30px;z-index:20000;display:flex;align-items:center;gap:12px;backdrop-filter:blur(10px);box-shadow:0 10px 40px rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.1);transition:opacity 0.3s;`;
            toast.innerHTML = `<i class="fas fa-history fa-spin" style="color:#4dabf7;"></i> <span id="load-all-toast-msg">准备导出：正在回溯历史记录... (第 0 组)</span>`;
            document.body.appendChild(toast);

            const toastMsg = toast.querySelector('#load-all-toast-msg');

            const intervalId = setInterval(() => {
                tickCount++;
                const currentScrollTop = scrollEl.scrollTop;
                toastMsg.innerText = `正在准备导出：已加载第 ${tickCount} 组历史对话...`;

                if (tickCount > MAX_TICKS) { finish(); return; }

                if (currentScrollTop === 0 && lastScrollTop === 0) {
                    stableZeroCount++;
                    if (stableZeroCount >= 3) { finish(); return; }
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
                toastMsg.style.color = '#51cf66';
                toastMsg.innerHTML = '<i class="fas fa-check" style="color:#51cf66;"></i> 对话数据准备就绪...';
                
                setTimeout(() => {
                    try {
                        update();
                        // 遵照用户需求：不再复位，直接滚到最新对话
                        scrollEl.scrollTo({ top: scrollEl.scrollHeight, behavior: 'instant' });
                    } catch (e) {
                        console.error('AI-Chat-Nodes: update error', e);
                    } finally {
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
        btn.className = 'ai-nodes-settings-btn' + (isDeepSeek ? ' ds-icon-button ds-icon-button--l ds-icon-button--sizing-container' : '');
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
                    <button id="ai-nodes-load-all" style="width: 100%; border: 1px solid #5b73f0; background: #f0f2ff; color: #5b73f0; padding: 7px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 500; transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 5px;">
                        <i class="fas fa-history" style="font-size: 11px;"></i> 加载全部历史节点
                    </button>
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

            <div style="margin-top: 12px; font-size: 11px; color: #bbb; text-align: right;">v1.5.15 | xchengb</div>
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
            // 先加载全部历史
            popup.style.opacity = '0';
            popup.style.pointerEvents = 'none';
            await startLoadAllHistory();
            openExportModal();
        };

        // 获取当前对话的所有消息
        function getAllMessages() {
            const list = [];
            if (isChatGPT) {
                // 兼容性选择器：精准定位 ChatGPT 文本正文，避免抓取到 UI 代码
                const turns = document.querySelectorAll('article, section[data-turn]');
                turns.forEach(turn => {
                    const role = turn.getAttribute('data-turn') || 
                                 turn.querySelector('[data-message-author-role]')?.getAttribute('data-message-author-role');
                    if (!role) return;

                    let text = '';
                    if (role === 'user') {
                        // 仅寻找用户消息的包装容器
                        const userEl = turn.querySelector('.whitespace-pre-wrap');
                        text = userEl ? userEl.innerText.trim() : '';
                    } else if (role === 'assistant') {
                        // 仅寻找 AI 的 Markdown 容器
                        const aiEl = turn.querySelector('.markdown');
                        text = aiEl ? aiEl.innerText.trim() : '';
                    }

                    if (text) list.push({ role: role === 'user' ? 'user' : 'assistant', text });
                });
            } else if (isQwen) {
                // 千问选择器增强：直接查找问题项和回答项
                const msgs = document.querySelectorAll('[class*="questionItem"], [class*="answerItem"]');
                msgs.forEach(msg => {
                    const isQ = msg.className.includes('questionItem');
                    const contentEl = isQ ? 
                                    (msg.querySelector('[class*="contentBox"]') || msg.querySelector('[class*="bubble"]')) :
                                    (msg.querySelector('[class*="qk-markdown"]') || msg.querySelector('[class*="markdown"]'));
                    
                    if (contentEl) {
                        const clone = contentEl.cloneNode(true);
                        clone.querySelectorAll('[data-c="result_card"], [class*="card_"], [class*="recommend"], .mt-4, button').forEach(el => el.remove());
                        
                        // 还原代码块标记（MD/TXT需反引号，HTML/PDF需标签）
                        clone.querySelectorAll('pre').forEach(pre => {
                            const code = pre.innerText.trim();
                            const lang = pre.closest('[class*="code-block"]')?.querySelector('[class*="lang"]')?.innerText || '';
                            pre.setAttribute('data-raw-code', `\n\`\`\`${lang}\n${code}\n\`\`\`\n`);
                        });
                        
                        const preEls = clone.querySelectorAll('pre');
                        const originalTexts = Array.from(preEls).map(p => p.innerText);
                        preEls.forEach(p => p.innerText = p.getAttribute('data-raw-code'));
                        const text = clone.innerText.trim();
                        preEls.forEach((p, i) => p.innerText = originalTexts[i]);
                        
                        list.push({ 
                            role: isQ ? 'user' : 'assistant', 
                            text: text,
                            html: clone.innerHTML 
                        });
                    }
                });
            } else if (isDoubao) {
                // 豆包选择器增强：抓取所有消息块，并区分角色
                const msgs = document.querySelectorAll('[data-testid="send_message"], [data-testid="receive_message"]');
                msgs.forEach(msg => {
                    const isQ = msg.getAttribute('data-testid') === 'send_message';
                    const contentParts = msg.querySelectorAll('[data-testid="message_text_content"], [data-testid="message_thought_result_content"], [data-testid="plugin_output"], [data-testid="ref-content-wrapper"]');
                    
                    let combinedText = "";
                    let combinedHtml = "";
                    
                    contentParts.forEach(part => {
                        const testId = part.getAttribute('data-testid');
                        const clone = part.cloneNode(true);
                        clone.querySelectorAll('[data-testid="ref-content-wrapper"], [data-foundation-type*="action-bar"], button').forEach(e => e.remove());
                        
                        // 还原代码块
                        clone.querySelectorAll('pre').forEach(pre => {
                            const code = pre.innerText.trim();
                            pre.setAttribute('data-raw-code', `\n\`\`\`\n${code}\n\`\`\`\n`);
                        });
                        
                        const preEls = clone.querySelectorAll('pre');
                        const originalTexts = Array.from(preEls).map(p => p.innerText);
                        preEls.forEach(p => p.innerText = p.getAttribute('data-raw-code'));
                        
                        const t = clone.innerText.trim();
                        if (t) {
                            if (testId === 'message_thought_result_content') {
                                combinedText += `\n> 【思维过程】：\n${t}\n\n`;
                                combinedHtml += `<blockquote class="thought-process">${clone.innerHTML}</blockquote>`;
                            } else if (testId === 'ref-content-wrapper') {
                                combinedText += `\n> 【引用回复】：${t}\n`;
                                combinedHtml += `<blockquote class="ref-quote">${clone.innerHTML}</blockquote>`;
                            } else {
                                combinedText += t + "\n";
                                combinedHtml += clone.innerHTML;
                            }
                        }
                        preEls.forEach((p, i) => p.innerText = originalTexts[i]);
                    });
                    
                    if (combinedText.trim()) {
                        list.push({ role: isQ ? 'user' : 'assistant', text: combinedText.trim(), html: combinedHtml });
                    }
                });
            } else if (isDeepSeek) {
                // DeepSeek 全量导出逻辑 - 基于 ds-message 层次结构
                // 为了保证顺序，我们遍历所有 message 块
                const msgBlocks = document.querySelectorAll('.ds-message');
                
                msgBlocks.forEach(el => {
                    const contentEl = el.querySelector('.ds-markdown') || el.querySelector('.ds-think-content') || el.querySelector('.ds-thought-content');
                    const isA = !!contentEl;
                    
                    if (isA) {
                        const markdownEl = el.querySelector('.ds-markdown');
                        const thoughtEl = el.querySelector('.ds-think-content') || el.querySelector('.ds-thought-content');
                        const cleanMarkdown = markdownEl ? markdownEl.cloneNode(true) : null;
                        const cleanThought = thoughtEl ? thoughtEl.cloneNode(true) : null;

                        [cleanMarkdown, cleanThought].forEach(node => {
                            if (!node) return;
                            node.querySelectorAll('.ds-code-block-header, button, .ds-icon-button, [class*="copy-button"], [class*="download-button"]').forEach(j => j.remove());
                        });

                        let combinedText = "";
                        let combinedHtml = "";

                        if (cleanThought) {
                            const tInnerImg = cleanThought.innerHTML;
                            if (tInnerImg.length > 20) {
                                combinedHtml += `<blockquote class="thought-process">${tInnerImg}</blockquote>`;
                                const tText = cleanThought.innerText.replace(/已思考.*/, '').trim();
                                if (tText) combinedText += `\n> 【深度思考过程】：\n${tText}\n\n`;
                            }
                        }

                        if (cleanMarkdown) {
                            cleanMarkdown.querySelectorAll('pre').forEach(pre => {
                                const code = pre.innerText.trim();
                                const lang = pre.closest('.ds-code-block')?.querySelector('.ds-code-block-header-lang')?.innerText || '';
                                pre.setAttribute('data-raw-code', `\n\`\`\`${lang}\n${code}\n\`\`\`\n`);
                            });
                            
                            const preEls = cleanMarkdown.querySelectorAll('pre');
                            const originalTexts = Array.from(preEls).map(p => p.innerText);
                            preEls.forEach(p => p.innerText = p.getAttribute('data-raw-code'));
                            const mText = cleanMarkdown.innerText.trim();
                            if (!combinedText.includes(mText) || mText.length < 50) combinedText += mText;
                            preEls.forEach((p, i) => p.innerText = originalTexts[i]);
                            combinedHtml += cleanMarkdown.innerHTML;
                        }

                        if (combinedText.trim()) {
                            list.push({ role: 'assistant', text: combinedText.trim(), html: combinedHtml });
                        }
                    } else {
                        const clone = el.cloneNode(true);
                        clone.querySelectorAll('button, .ds-icon-button, .ds-message__actions').forEach(i => i.remove());
                        list.push({ role: 'user', text: clone.innerText.trim(), html: clone.innerHTML });
                    }
                });
            }
            
            // 核心归一化：将连续出现的同角色消息物理合并（解决 DeepSeek 思考与回答分容器的问题）
            const normalized = [];
            list.forEach(msg => {
                const last = normalized[normalized.length - 1];
                if (last && last.role === msg.role) {
                    last.text += "\n\n" + msg.text;
                    if (last.html && msg.html) last.html += msg.html;
                } else {
                    normalized.push(msg);
                }
            });
            return normalized;
        }

        // 处理文件保存逻辑
        function handleExport(data, format) {
            const fileName = `${AI_NAME}_Export_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '_')}`;
            let content = '';
            let type = 'text/plain;charset=utf-8';
            let ext = format;

            if (format === 'json') {
                content = JSON.stringify(data.map(m => ({ role: m.role, text: m.text })), null, 2);
                type = 'application/json';
            } else if (format === 'csv') {
                content = '\uFEFFRole,Content\n' + data.map(m => `${m.role === 'user' ? 'User' : AI_NAME},"${m.text.replace(/"/g, '""')}"`).join('\n');
                type = 'text/csv';
            } else if (format === 'txt') {
                content = data.map(m => `----------------------------\n【${m.role === 'user' ? '用户问题' : AI_NAME}】\n----------------------------\n${m.text}`).join('\n\n');
            } else if (format === 'md') {
                content = data.map(m => `### ${m.role === 'user' ? '🧑 用户问题' : '🤖 ' + AI_NAME + '回答'}\n\n${m.text}`).join('\n\n---\n\n');
            } else if (format === 'pdf') {
                const win = window.open('', '_blank');
                // 聚合逻辑：将 User 发起及随后跟随的所有连续 Assistant 回复视为一个对话组（1 轮）
                const groups = [];
                for (let i = 0; i < data.length; i++) {
                    const turn = [data[i]];
                    // 如果当前是用户且后续有助手消息，则把后续所有连续的助手消息全部卷进来
                    if (data[i].role === 'user') {
                        while (i + 1 < data.length && data[i + 1].role === 'assistant') {
                            turn.push(data[i + 1]);
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
                            <div style="flex:1;">
                                ${group.map(m => `
                                    <div class="msg ${m.role}">
                                        <div class="role-badge">
                                            ${m.role === 'user' ? '🧑 USER QUESTION' : '🤖 ' + AI_NAME.toUpperCase() + ' RESPONSE'}
                                        </div>
                                        <div class="text">${m.html || m.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
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
        function openExportModal() {
            const allMsgs = getAllMessages();
            if (!allMsgs.length) { alert('未检测到可导出的内容'); return; }

            const overlay = document.createElement('div');
            overlay.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:999999;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:40px;`;
            
            const modal = document.createElement('div');
            modal.style.cssText = `background:#fff;width:100%;max-width:850px;height:85vh;border-radius:20px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 15px 45px rgba(0,0,0,0.3);`;
            
            modal.innerHTML = `
                <div style="padding:20px 24px;border-bottom:1px solid #eee;display:flex;justify-content:space-between;align-items:center;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <h3 style="margin:0;font-size:18px;">对话导出管理</h3>
                    </div>
                    <button id="modal-x" style="cursor:pointer;border:none;background:#eee;width:28px;height:28px;border-radius:50%;font-size:16px;display:flex;align-items:center;justify-content:center;">&times;</button>
                </div>
                <div style="padding:10px 24px;background:#f8f9fa;border-bottom:1px solid #eee;display:flex;gap:12px;align-items:center;">
                    <button class="m-util-btn" id="m-all">全选</button>
                    <button class="m-util-btn" id="m-none">取消全选</button>
                    <button class="m-util-btn" id="m-ans" style="background:#e7f3ff;color:#0d6efd;">仅选回答</button>
                    ${isDeepSeek ? '<button class="m-util-btn" id="m-no-thought" style="background:#fff7e6;color:#d46b08;border-color:#ffd591;">排除思考过程</button>' : ''}
                    <div style="flex:1"></div>
                    <span style="font-size:12px;color:#666;">已选 <b id="m-count-view">${allMsgs.length}</b> 条</span>
                </div>
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
                    .m-view-btn { opacity:0; pointer-events:none; position:absolute; right:24px; top:50%; transform:translateY(-50%); border:none; background:#007bff; padding:5px 12px; border-radius:8px; font-size:11px; font-weight:600; cursor:pointer; color:#fff; transition:all 0.2s; box-shadow:0 4px 12px rgba(0,123,255,0.25); z-index:10; }
                    .m-view-btn:hover { background:#0056b3; transform:translateY(-50%) scale(1.05); }
                    .m-item-row:hover .m-view-btn { opacity:1; pointer-events:auto; }
                </style>
            `;

            const listBox = modal.querySelector('#m-list-box');
            allMsgs.forEach((m, i) => {
                const item = document.createElement('div');
                item.className = 'm-item-row';
                if (m.isThought) item.setAttribute('data-is-thought', 'true');
                const isU = m.role === 'user';
                
                item.style.cssText = `display:flex; gap:10px; padding:15px 20px; border-bottom:1px solid #f8f8f8; position:relative;`;

                item.innerHTML = `
                    <div style="width:25px; flex-shrink:0; display:flex; align-items:center;">
                        <input type="checkbox" class="m-row-ck" data-i="${i}" checked style="width:18px;height:18px;cursor:pointer;">
                    </div>
                    <div style="flex:1; display:flex; flex-direction:column; gap:4px;">
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
                            <div style="font-size:10px; font-weight:700; margin-bottom:5px; opacity:0.7;">${isU ? '用户问题' : AI_NAME}</div>
                            <div class="m-row-text" style="display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; text-overflow:ellipsis;"></div>
                            <button class="m-view-btn">查看全文</button>
                        </div>
                    </div>
                `;
                
                // 核心加固：使用 textContent 
                item.querySelector('.m-row-text').textContent = m.text;

                const detailBtn = item.querySelector('.m-view-btn');
                item.onmouseenter = () => detailBtn.style.opacity = '1';
                item.onmouseleave = () => detailBtn.style.opacity = '0';

                detailBtn.onclick = (e) => {
                    e.stopPropagation();
                    showFullText(m.text, isU ? '用户问题全文' : AI_NAME + '回答全文');
                };

                listBox.appendChild(item);
            });

            document.body.appendChild(overlay);
            overlay.appendChild(modal);

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

            const cl = () => document.body.removeChild(overlay);
            modal.querySelector('#modal-x').onclick = cl;
            overlay.onclick = (e) => { if (e.target === overlay) cl(); };

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
                // 豆包注入位置：优先选择顶栏分享按钮所在的容器
                container = document.querySelector('[data-testid="thread_share_btn_right_side"]')?.parentElement ||
                            document.querySelector('[data-testid="chat_header"] [class*="container-Wp7m8C"]') || 
                            document.querySelector('[data-testid="chat_header"] div:last-child');
            } else if (isDeepSeek) {
                // DeepSeek 注入位置：对话标题栏右侧
                const shareBtn = document.querySelector('div[class*="_57370c5"]');
                if (shareBtn) {
                    container = shareBtn.parentElement;
                    if (container && !container.querySelector('.ai-nodes-settings-btn')) {
                        container.insertBefore(btn, shareBtn);
                        setTimeout(applyAutoCollapse, 500);
                        return true;
                    }
                }
                // 备选方案
                container = document.querySelector('div[class*="_0efe408"]') || 
                            document.querySelector('div[class*="_2be88ba"]') ||
                            document.querySelector('.dc04ec1d.a02af2e6 > div:last-child') || 
                            document.querySelector('header div:last-child');
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
    }

    init();
    injectSettings();
})();
