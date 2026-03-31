// ==UserScript==
// @name         网页结构分析工具 (Chat DOM Dumper)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  一键抓取并下载当前页面的聊天区域 HTML 结构（已去除多余 SVG 和样式干扰），辅助分析 DOM 选择器。
// @author       xchengb
// @match        *://chatgpt.com/*
// @match        *://tongyi.aliyun.com/*
// @match        *://*.qianwen.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function createBtn() {
        const btn = document.createElement('button');
        btn.innerHTML = '📋 抓取结构';
        btn.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 999999;
            padding: 10px 16px;
            background: #000;
            color: #fff;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            font-family: sans-serif;
            transition: all 0.2s;
        `;
        
        btn.onmouseover = () => btn.style.transform = 'scale(1.05)';
        btn.onmouseout = () => btn.style.transform = 'scale(1)';
        
        btn.onclick = () => {
            // 尝试寻找可能的聊天容器
            const selectors = [
                '[class*="answerItem"]', 
                '[class*="questionItem"]', 
                'article', 
                'section[data-turn]',
                '[class*="messageList"]',
                'main'
            ];
            
            let htmlContent = '';
            
            // 获取所有可能的消息项
            const items = document.querySelectorAll(selectors.join(','));
            
            if (items.length > 0) {
                items.forEach((item, idx) => {
                    // 克隆节点以防止干扰原页面
                    const clone = item.cloneNode(true);
                    
                    // 清理：移除所有 SVG、路径、脚本和样式标签以减小体积
                    clone.querySelectorAll('svg, script, style, path, use, link').forEach(el => el.remove());
                    
                    // 标记层级
                    htmlContent += `\n<!-- ITEM ${idx + 1} CLASS: ${item.className} -->\n`;
                    htmlContent += clone.outerHTML + '\n';
                });
            } else {
                htmlContent = "未检测到预设的聊天选择器，抓取 body 内容：\n" + document.body.innerHTML;
            }

            // 下载文件
            const blob = new Blob([htmlContent], { type: 'text/html' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `DOM_Structure_${window.location.hostname}_${new Date().getTime()}.html`;
            a.click();
            URL.revokeObjectURL(url);
            
            btn.innerHTML = '✅ 抓取成功';
            setTimeout(() => btn.innerHTML = '📋 抓取结构', 2000);
        };

        document.body.appendChild(btn);
    }

    // 等待页面加载
    if (document.readyState === 'complete') {
        createBtn();
    } else {
        window.addEventListener('load', createBtn);
    }
})();
