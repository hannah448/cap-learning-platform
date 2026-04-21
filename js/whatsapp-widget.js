/* ============================================
   Cap Learning - WhatsApp Chat Widget
   Floating button bottom-right with chat popup
   ============================================ */
(function () {
    'use strict';

    // ---- Configuration ----
    var CONFIG = {
        phoneNumber: '221781234567',       // Numéro WhatsApp (format international sans +)
        defaultMessage: 'Bonjour Cap Learning ! J\u2019ai une question concernant vos formations.',
        companyName: 'Cap Learning',
        welcomeText: 'Bonjour ! \uD83D\uDC4B Comment pouvons-nous vous aider ?',
        replyTime: 'R\u00e9pond g\u00e9n\u00e9ralement en quelques minutes',
        scheduleText: 'Lun-Ven : 8h - 20h \u00b7 Sam : 9h - 17h',
        ctaText: 'D\u00e9marrer le chat',
        tooltipText: 'Besoin d\u2019aide ?'
    };

    // ---- Inject CSS ----
    var style = document.createElement('style');
    style.textContent = [
        /* Container */
        '.wa-widget { position: fixed; bottom: 24px; right: 24px; z-index: 9999; font-family: "DM Sans", "Satoshi", sans-serif; }',

        /* Floating Button */
        '.wa-btn { width: 60px; height: 60px; border-radius: 50%; background: #25D366; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 16px rgba(37,211,102,.45); transition: transform .25s ease, box-shadow .25s ease; position: relative; }',
        '.wa-btn:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(37,211,102,.55); }',
        '.wa-btn:active { transform: scale(.96); }',
        '.wa-btn svg { width: 32px; height: 32px; fill: #fff; }',
        '.wa-btn .wa-close-icon { display: none; }',
        '.wa-widget.open .wa-btn .wa-wa-icon { display: none; }',
        '.wa-widget.open .wa-btn .wa-close-icon { display: block; width: 20px; height: 20px; }',

        /* Pulse animation */
        '.wa-btn::before { content: ""; position: absolute; width: 100%; height: 100%; border-radius: 50%; background: #25D366; opacity: .4; animation: waPulse 2s ease-out infinite; }',
        '.wa-widget.open .wa-btn::before { animation: none; opacity: 0; }',
        '@keyframes waPulse { 0% { transform: scale(1); opacity: .4; } 100% { transform: scale(1.6); opacity: 0; } }',

        /* Tooltip */
        '.wa-tooltip { position: absolute; right: 72px; top: 50%; transform: translateY(-50%); background: #fff; color: #1E293B; padding: 8px 16px; border-radius: 8px; font-size: 14px; font-weight: 500; white-space: nowrap; box-shadow: 0 2px 12px rgba(0,0,0,.12); opacity: 0; pointer-events: none; transition: opacity .3s ease, transform .3s ease; transform: translateY(-50%) translateX(8px); }',
        '.wa-tooltip::after { content: ""; position: absolute; right: -6px; top: 50%; transform: translateY(-50%); border: 6px solid transparent; border-left-color: #fff; }',
        '.wa-btn:hover + .wa-tooltip, .wa-tooltip.show { opacity: 1; transform: translateY(-50%) translateX(0); }',
        '.wa-widget.open .wa-tooltip { opacity: 0 !important; pointer-events: none; }',

        /* Badge notification dot */
        '.wa-badge { position: absolute; top: -2px; right: -2px; width: 18px; height: 18px; background: #EF4444; border-radius: 50%; border: 2px solid #fff; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #fff; font-weight: 700; animation: waBadgeBounce .6s ease; }',
        '.wa-widget.open .wa-badge { display: none; }',
        '@keyframes waBadgeBounce { 0%,100% { transform: scale(1); } 50% { transform: scale(1.3); } }',

        /* Chat Popup */
        '.wa-popup { position: absolute; bottom: 76px; right: 0; width: 340px; background: #fff; border-radius: 16px; box-shadow: 0 12px 48px rgba(0,0,0,.18); overflow: hidden; transform: scale(.85) translateY(16px); opacity: 0; pointer-events: none; transition: transform .3s cubic-bezier(.34,1.56,.64,1), opacity .25s ease; transform-origin: bottom right; }',
        '.wa-widget.open .wa-popup { transform: scale(1) translateY(0); opacity: 1; pointer-events: auto; }',

        /* Popup Header */
        '.wa-popup-header { background: #075E54; padding: 20px; display: flex; align-items: center; gap: 12px; }',
        '.wa-popup-avatar { width: 48px; height: 48px; border-radius: 50%; background: #25D366; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 20px; font-weight: 700; color: #fff; }',
        '.wa-popup-info { color: #fff; }',
        '.wa-popup-name { font-size: 16px; font-weight: 600; margin: 0; }',
        '.wa-popup-status { font-size: 12px; opacity: .85; margin-top: 2px; display: flex; align-items: center; gap: 6px; }',
        '.wa-popup-status::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: #25D366; display: inline-block; }',

        /* Popup Body (chat bubble style) */
        '.wa-popup-body { padding: 20px; background: #E5DDD5; background-image: url("data:image/svg+xml,%3Csvg width=\'200\' height=\'200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cdefs%3E%3Cpattern id=\'p\' width=\'40\' height=\'40\' patternUnits=\'userSpaceOnUse\'%3E%3Cpath d=\'M0 20h40M20 0v40\' stroke=\'%23d4cfc4\' stroke-width=\'.5\' fill=\'none\'/%3E%3C/pattern%3E%3C/defs%3E%3Crect width=\'200\' height=\'200\' fill=\'url(%23p)\'/%3E%3C/svg%3E"); }',
        '.wa-bubble { background: #fff; padding: 14px 16px; border-radius: 0 12px 12px 12px; font-size: 14px; line-height: 1.5; color: #1E293B; position: relative; box-shadow: 0 1px 2px rgba(0,0,0,.08); }',
        '.wa-bubble::before { content: ""; position: absolute; top: 0; left: -8px; border: 8px solid transparent; border-top-color: #fff; border-right-color: #fff; }',
        '.wa-bubble-time { font-size: 11px; color: #94A3B8; text-align: right; margin-top: 4px; }',
        '.wa-schedule { font-size: 12px; color: #64748B; text-align: center; margin-top: 12px; }',

        /* CTA Button */
        '.wa-popup-footer { padding: 16px 20px; }',
        '.wa-cta { display: flex; align-items: center; justify-content: center; gap: 10px; width: 100%; padding: 14px; background: #25D366; color: #fff; border: none; border-radius: 12px; font-size: 15px; font-weight: 600; cursor: pointer; transition: background .2s ease, transform .15s ease; font-family: inherit; }',
        '.wa-cta:hover { background: #1EBE5B; transform: translateY(-1px); }',
        '.wa-cta:active { transform: translateY(0); }',
        '.wa-cta svg { width: 20px; height: 20px; fill: #fff; flex-shrink: 0; }',

        /* Responsive */
        '@media (max-width: 480px) { .wa-widget { bottom: 16px; right: 16px; } .wa-popup { width: calc(100vw - 32px); right: 0; } .wa-btn { width: 54px; height: 54px; } .wa-btn svg { width: 28px; height: 28px; } .wa-tooltip { display: none; } }'
    ].join('\n');
    document.head.appendChild(style);

    // ---- Build Widget DOM ----
    var widget = document.createElement('div');
    widget.className = 'wa-widget';
    widget.setAttribute('aria-label', 'Chat WhatsApp');

    // WhatsApp SVG icon
    var waIconSVG = '<svg class="wa-wa-icon" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16.004 2.667A13.27 13.27 0 0 0 2.77 15.867a13.17 13.17 0 0 0 1.8 6.657L2.667 29.333l7.04-1.844a13.3 13.3 0 0 0 6.297 1.604h.005A13.274 13.274 0 0 0 16.004 2.667Zm0 24.302a11.01 11.01 0 0 1-5.614-1.537l-.403-.239-4.178 1.095 1.115-4.073-.263-.418a10.97 10.97 0 0 1-1.686-5.867 11.033 11.033 0 1 1 11.029 11.039Zm6.05-8.265c-.332-.166-1.963-.969-2.268-1.08-.305-.11-.527-.166-.749.167-.222.332-.86 1.08-1.054 1.301-.194.222-.389.25-.721.083-.332-.166-1.403-.517-2.672-1.648-.988-.88-1.655-1.966-1.849-2.298-.194-.332-.02-.512.146-.677.15-.149.332-.389.498-.583.166-.194.222-.332.332-.555.111-.222.056-.417-.028-.583-.083-.166-.749-1.806-1.026-2.473-.27-.649-.545-.561-.749-.572l-.638-.011a1.224 1.224 0 0 0-.888.417c-.305.332-1.165 1.138-1.165 2.775s1.192 3.22 1.358 3.442c.166.222 2.345 3.58 5.683 5.02.794.343 1.414.548 1.897.701.797.253 1.523.217 2.096.132.64-.095 1.963-.803 2.24-1.578.277-.775.277-1.44.194-1.578-.083-.139-.305-.222-.637-.389Z"/></svg>';

    // Close icon SVG
    var closeIconSVG = '<svg class="wa-close-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M18 6L6 18M6 6l12 12" stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>';

    // Current time for bubble
    function getTimeStr() {
        var now = new Date();
        var h = now.getHours();
        var m = now.getMinutes();
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
    }

    widget.innerHTML = [
        '<div class="wa-popup">',
        '  <div class="wa-popup-header">',
        '    <div class="wa-popup-avatar">A</div>',
        '    <div class="wa-popup-info">',
        '      <div class="wa-popup-name">' + CONFIG.companyName + '</div>',
        '      <div class="wa-popup-status">En ligne</div>',
        '    </div>',
        '  </div>',
        '  <div class="wa-popup-body">',
        '    <div class="wa-bubble">',
        '      ' + CONFIG.welcomeText + '<br><br><strong>' + CONFIG.replyTime + '</strong>',
        '      <div class="wa-bubble-time">' + getTimeStr() + '</div>',
        '    </div>',
        '    <div class="wa-schedule">' + CONFIG.scheduleText + '</div>',
        '  </div>',
        '  <div class="wa-popup-footer">',
        '    <button class="wa-cta" id="waCta">',
        '      <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg"><path d="M16.004 2.667A13.27 13.27 0 0 0 2.77 15.867a13.17 13.17 0 0 0 1.8 6.657L2.667 29.333l7.04-1.844a13.3 13.3 0 0 0 6.297 1.604h.005A13.274 13.274 0 0 0 16.004 2.667Zm0 24.302a11.01 11.01 0 0 1-5.614-1.537l-.403-.239-4.178 1.095 1.115-4.073-.263-.418a10.97 10.97 0 0 1-1.686-5.867 11.033 11.033 0 1 1 11.029 11.039Zm6.05-8.265c-.332-.166-1.963-.969-2.268-1.08-.305-.11-.527-.166-.749.167-.222.332-.86 1.08-1.054 1.301-.194.222-.389.25-.721.083-.332-.166-1.403-.517-2.672-1.648-.988-.88-1.655-1.966-1.849-2.298-.194-.332-.02-.512.146-.677.15-.149.332-.389.498-.583.166-.194.222-.332.332-.555.111-.222.056-.417-.028-.583-.083-.166-.749-1.806-1.026-2.473-.27-.649-.545-.561-.749-.572l-.638-.011a1.224 1.224 0 0 0-.888.417c-.305.332-1.165 1.138-1.165 2.775s1.192 3.22 1.358 3.442c.166.222 2.345 3.58 5.683 5.02.794.343 1.414.548 1.897.701.797.253 1.523.217 2.096.132.64-.095 1.963-.803 2.24-1.578.277-.775.277-1.44.194-1.578-.083-.139-.305-.222-.637-.389Z"/></svg>',
        '      ' + CONFIG.ctaText,
        '    </button>',
        '  </div>',
        '</div>',
        '<button class="wa-btn" id="waToggle" aria-label="Ouvrir le chat WhatsApp">',
        '  ' + waIconSVG,
        '  ' + closeIconSVG,
        '  <span class="wa-badge">1</span>',
        '</button>',
        '<div class="wa-tooltip">' + CONFIG.tooltipText + '</div>'
    ].join('\n');

    // ---- Insert into page ----
    document.body.appendChild(widget);

    // ---- Behavior ----
    var toggleBtn = document.getElementById('waToggle');
    var ctaBtn = document.getElementById('waCta');
    var isOpen = false;

    toggleBtn.addEventListener('click', function () {
        isOpen = !isOpen;
        widget.classList.toggle('open', isOpen);
    });

    // Close on click outside
    document.addEventListener('click', function (e) {
        if (isOpen && !widget.contains(e.target)) {
            isOpen = false;
            widget.classList.remove('open');
        }
    });

    // Close on Escape
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && isOpen) {
            isOpen = false;
            widget.classList.remove('open');
            toggleBtn.focus();
        }
    });

    // CTA → open WhatsApp
    ctaBtn.addEventListener('click', function () {
        var url = 'https://wa.me/' + CONFIG.phoneNumber + '?text=' + encodeURIComponent(CONFIG.defaultMessage);
        window.open(url, '_blank', 'noopener');
    });

    // Show tooltip after 3s if not interacted
    var tooltipTimer = setTimeout(function () {
        var tip = widget.querySelector('.wa-tooltip');
        if (tip && !isOpen) {
            tip.classList.add('show');
            setTimeout(function () { tip.classList.remove('show'); }, 4000);
        }
    }, 3000);

    // Clear tooltip timer on interaction
    toggleBtn.addEventListener('click', function () {
        clearTimeout(tooltipTimer);
    }, { once: true });

})();
