/**
 * Cap Learning — Table of Contents flottante pour pages produit (.sales-page)
 * Auto-découvre les sections et construit un TOC fixe sur desktop (>= 1200px).
 * Highlight automatique de la section visible via IntersectionObserver.
 */
(function () {
    'use strict';

    var sales = document.querySelector('.sales-page');
    if (!sales) return;

    // Mapping des classes section → label FR + icône
    var sectionMap = [
        { selector: '.sales-hero', label: 'Vue d\'ensemble', icon: '\u2728' },
        { selector: '.sales-outcomes', label: 'Ce que vous saurez faire', icon: '\u2705' },
        { selector: '.sales-for-who', label: 'Pour qui ?', icon: '\uD83D\uDC65' },
        { selector: '.curriculum-section', label: 'Programme', icon: '\uD83D\uDCDA' },
        { selector: '.sales-social-proof', label: 'Témoignages', icon: '\uD83D\uDCAC' },
        { selector: '.sales-instructor', label: 'Formateur·ice', icon: '\uD83C\uDF93' },
        { selector: '.sales-faq', label: 'FAQ', icon: '\u2753' },
        { selector: '.sales-related', label: 'Formations li\u00e9es', icon: '\uD83D\uDD17' },
        { selector: '.sales-final-cta', label: 'S\'inscrire', icon: '\uD83D\uDE80' }
    ];

    var items = [];
    sectionMap.forEach(function (m, i) {
        var el = sales.querySelector(m.selector);
        if (!el) return;
        if (!el.id) el.id = 'toc-section-' + i + '-' + m.selector.replace(/[^a-z0-9]/gi, '');
        items.push({ el: el, label: m.label, icon: m.icon });
    });
    if (items.length < 2) return;

    // --- Build DOM ---
    var nav = document.createElement('nav');
    nav.className = 'sales-toc';
    nav.setAttribute('aria-label', 'Table des matières');

    var h = document.createElement('div');
    h.className = 'sales-toc-title';
    h.textContent = 'Sur cette page';
    nav.appendChild(h);

    var ul = document.createElement('ul');
    ul.className = 'sales-toc-list';
    items.forEach(function (it) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#' + it.el.id;
        a.className = 'sales-toc-link';
        a.setAttribute('data-target', it.el.id);
        a.innerHTML = '<span class="sales-toc-icon" aria-hidden="true">' + it.icon + '</span><span class="sales-toc-label">' + it.label + '</span>';
        a.addEventListener('click', function (e) {
            e.preventDefault();
            var target = document.getElementById(it.el.id);
            if (!target) return;
            var top = target.getBoundingClientRect().top + window.pageYOffset - 80;
            window.scrollTo({ top: top, behavior: 'smooth' });
            history.replaceState(null, '', '#' + it.el.id);
        });
        li.appendChild(a);
        ul.appendChild(li);
    });
    nav.appendChild(ul);

    document.body.appendChild(nav);

    // --- Active highlight via IntersectionObserver ---
    var linksByid = {};
    nav.querySelectorAll('.sales-toc-link').forEach(function (a) {
        linksByid[a.getAttribute('data-target')] = a;
    });

    if ('IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                var link = linksByid[entry.target.id];
                if (!link) return;
                if (entry.isIntersecting && entry.intersectionRatio >= 0.2) {
                    nav.querySelectorAll('.sales-toc-link.active').forEach(function (a) { a.classList.remove('active'); });
                    link.classList.add('active');
                }
            });
        }, { rootMargin: '-20% 0px -60% 0px', threshold: [0, 0.2, 0.5, 1] });

        items.forEach(function (it) { io.observe(it.el); });
    }
})();
