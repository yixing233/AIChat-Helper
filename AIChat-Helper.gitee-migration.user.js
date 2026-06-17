// ==UserScript==
// @name         AI对话助手（Gitee迁移引导）
// @namespace    http://tampermonkey.net/
// @version      2.0.7
// @description  旧 Gitee 发布地址已停止维护，自动引导前往 GitHub 安装最新版 AIChat-Helper。
// @author       xchengb
// @homepageURL  https://github.com/yixing233/AIChat-Helper
// @supportURL   https://github.com/yixing233/AIChat-Helper/issues
// @match        *://chatgpt.com/*
// @match        *://www.qianwen.com/*
// @match        *://www.doubao.com/chat*
// @match        *://chat.deepseek.com/*
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const INSTALL_URL = 'https://github.com/yixing233/AIChat-Helper/raw/master/AIChat-Helper.user.js';
    const REPO_URL = 'https://github.com/yixing233/AIChat-Helper';
    const LAST_PROMPT_KEY = 'ai-chat-helper-gitee-migration-last-prompt';
    const REMIND_INTERVAL = 24 * 60 * 60 * 1000;

    try {
        const lastPrompt = Number(localStorage.getItem(LAST_PROMPT_KEY) || 0);
        if (Date.now() - lastPrompt < REMIND_INTERVAL) return;
        localStorage.setItem(LAST_PROMPT_KEY, String(Date.now()));
    } catch (_) {}

    const message =
        'AIChat-Helper 已迁移到 GitHub，Gitee 旧地址不再维护。\n\n' +
        '请点击“确定”前往安装最新版脚本。';

    const openNewVersionPage = () => {
        const opened = window.open(INSTALL_URL, '_blank', 'noopener,noreferrer');
        if (opened) return;
        window.location.href = INSTALL_URL;
    };

    const showBanner = () => {
        const root = document.createElement('div');
        root.id = 'ai-chat-helper-migration-banner';
        root.style.cssText = [
            'position:fixed',
            'right:16px',
            'bottom:16px',
            'z-index:2147483647',
            'max-width:360px',
            'padding:12px',
            'border-radius:10px',
            'background:#111827',
            'color:#f9fafb',
            'box-shadow:0 10px 30px rgba(0,0,0,.35)',
            'font:13px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,PingFang SC,Microsoft YaHei,sans-serif'
        ].join(';');

        root.innerHTML = '' +
            '<div style="font-weight:700;margin-bottom:6px">AIChat-Helper 已迁移至 GitHub</div>' +
            '<div style="opacity:.92">Gitee 旧地址已停止维护，请安装最新版本。</div>' +
            '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">' +
            '<a href="' + INSTALL_URL + '" target="_blank" rel="noopener noreferrer" ' +
            'style="background:#2563eb;color:#fff;text-decoration:none;padding:6px 10px;border-radius:8px">安装最新版</a>' +
            '<a href="' + REPO_URL + '" target="_blank" rel="noopener noreferrer" ' +
            'style="background:#374151;color:#fff;text-decoration:none;padding:6px 10px;border-radius:8px">打开仓库</a>' +
            '</div>';

        document.documentElement.appendChild(root);
    };

    const start = () => {
        const confirmed = window.confirm(message);
        if (confirmed) {
            openNewVersionPage();
            return;
        }
        showBanner();
    };

    if (document.readyState === 'loading') {
        window.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
