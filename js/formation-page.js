/**
 * Cap Learning — Page produit formation (gabarit v2)
 * ---------------------------------------------------------------------------
 * Trois comportements, aucun état serveur :
 *   1. Accordéon programme  — un bloc ouvert à la fois, + « Tout déplier »
 *   2. Accordéon FAQ        — un panneau à la fois
 *   3. Barre d'achat        — apparaît au-delà de 480 px de scroll
 *
 * Les accordéons sont de vrais <button aria-expanded> pilotant un panneau
 * identifié : le +/− n'est que décoratif (aria-hidden).
 */
(function () {
    'use strict';

    var page = document.querySelector('.fp');
    if (!page) return;

    /* ---------------------------------------------------------------
       1. Accordéon programme
       --------------------------------------------------------------- */
    var blocks = Array.prototype.slice.call(page.querySelectorAll('.fp-block'));
    var toggleAllBtn = page.querySelector('[data-fp-toggle-all]');
    var allOpen = false;

    function blockParts(block) {
        return {
            btn: block.querySelector('.fp-block-btn'),
            panel: block.querySelector('.fp-block-panel'),
            sign: block.querySelector('.fp-sign')
        };
    }

    function setBlock(block, open) {
        var p = blockParts(block);
        if (!p.btn || !p.panel) return;
        p.panel.hidden = !open;
        p.btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (p.sign) p.sign.textContent = open ? '−' : '+';
    }

    function openOnly(index) {
        blocks.forEach(function (b, i) { setBlock(b, i === index); });
    }

    blocks.forEach(function (block, i) {
        var p = blockParts(block);
        if (!p.btn || !p.panel) return;

        // Un bloc ouvert au clic ferme les autres. Recliquer sur le bloc
        // ouvert le referme. « Tout déplier » repasse en mode exclusif ici.
        p.btn.addEventListener('click', function () {
            var wasOpen = p.btn.getAttribute('aria-expanded') === 'true';
            if (allOpen) {
                allOpen = false;
                syncToggleAllLabel();
                openOnly(i);
                return;
            }
            if (wasOpen) {
                setBlock(block, false);
            } else {
                openOnly(i);
            }
        });
    });

    function syncToggleAllLabel() {
        if (toggleAllBtn) toggleAllBtn.textContent = allOpen ? 'Tout replier' : 'Tout déplier';
    }

    if (toggleAllBtn) {
        toggleAllBtn.addEventListener('click', function () {
            allOpen = !allOpen;
            blocks.forEach(function (b) { setBlock(b, allOpen); });
            syncToggleAllLabel();
        });
    }

    // État initial : premier bloc ouvert
    if (blocks.length) openOnly(0);
    syncToggleAllLabel();

    /* ---------------------------------------------------------------
       2. Accordéon FAQ — un seul panneau ouvert, le premier par défaut
       --------------------------------------------------------------- */
    var faqItems = Array.prototype.slice.call(page.querySelectorAll('.fp-faq-item'));

    function setFaq(item, open) {
        var btn = item.querySelector('.fp-faq-btn');
        var answer = item.querySelector('.fp-faq-answer');
        var sign = item.querySelector('.fp-sign');
        if (!btn || !answer) return;
        answer.hidden = !open;
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (sign) sign.textContent = open ? '−' : '+';
    }

    faqItems.forEach(function (item, i) {
        var btn = item.querySelector('.fp-faq-btn');
        if (!btn) return;
        btn.addEventListener('click', function () {
            var wasOpen = btn.getAttribute('aria-expanded') === 'true';
            faqItems.forEach(function (other, j) { setFaq(other, !wasOpen && j === i); });
        });
        setFaq(item, i === 0);
    });

    /* ---------------------------------------------------------------
       3. Barre d'achat collante
       --------------------------------------------------------------- */
    var bar = document.querySelector('.fp-bar');
    if (!bar) return;

    var shown = null;

    function syncBar() {
        var next = (window.scrollY || document.documentElement.scrollTop || 0) > 480;
        if (next === shown) return;
        shown = next;
        bar.classList.toggle('is-visible', next);
        bar.setAttribute('aria-hidden', next ? 'false' : 'true');
        // Remonte le widget WhatsApp pour qu'il ne passe pas sous la barre
        document.body.classList.toggle('fp-bar-on', next);
    }

    window.addEventListener('scroll', syncBar, { passive: true });
    syncBar();
})();
