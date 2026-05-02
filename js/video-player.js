/**
 * Cap Learning — Video Player
 * --------------------------------------------------------------
 * Lecteur vidéo unifié, 100 % vanilla JS (pas de React, pas de build).
 *
 * Stack cible :
 *   - Hébergement : Amazon S3 (bucket privé ou public restreint)
 *   - CDN        : Cloudflare (cache + hotlink protection + signed URLs)
 *   - Format     : HLS (.m3u8 + segments .ts / .fmp4) → adaptive bitrate
 *   - Lecteur    : <video> natif + hls.js (lazy-loaded) pour Chrome/FF
 *                  (Safari / iOS lisent HLS nativement, sans hls.js)
 *
 * Consomme js/video-mapping.json pour résoudre chaque leçon par son
 * lesson_id (ex: 'l1-1', 'e2-1'). Le mapping définit le provider,
 * l'URL source, la durée, les sous-titres et le statut.
 *
 * Exemple d'usage :
 *
 *   // Démarrage
 *   CapPlayer.init();
 *
 *   // Monter un lecteur pour une leçon
 *   CapPlayer.mount('#player-area', 'l1-1', {
 *     onProgress: (pct, seconds) => updateProgressBar(pct),
 *     onComplete: () => markLessonDone('l1-1'),
 *     demoMode: location.search.indexOf('demo=1') !== -1
 *   });
 *
 *   // Démonter (ex: l'utilisateur change de leçon non vidéo)
 *   CapPlayer.unmount('#player-area');
 *
 * Providers supportés :
 *   - 's3' | 'hls' : <video> + hls.js lazy-loaded (HLS natif sur Safari)
 *   - 'mp4'        : <video> HTML5 avec src direct (fallback / bonus)
 *
 * Le mapping attendu par leçon :
 *   {
 *     "title": "...", "status": "live"|"pending",
 *     "provider": "s3"|"hls"|"mp4",
 *     "s3":      { "master_url": "https://cdn.cap-learning.com/.../master.m3u8" },
 *     "mp4":     { "url": "https://cdn.cap-learning.com/.../video.mp4" },
 *     "poster":  "https://cdn.cap-learning.com/.../poster.jpg",
 *     "duration_seconds": 750,
 *     "subtitles": [ { "lang": "fr", "label": "Français",
 *                      "default": true, "src": "/vtt/l1-1.fr.vtt" } ]
 *   }
 */
(function (global) {
    'use strict';

    // --------- Config ---------

    // Résout le sibling video-mapping.json à partir de l'emplacement
    // de ce script, pour fonctionner quelle que soit la page hôte.
    var MAPPING_URL = (function () {
        var cs = document.currentScript;
        if (cs && cs.src) {
            return cs.src.replace(/video-player\.js(\?.*)?$/, 'video-mapping.json');
        }
        return '../js/video-mapping.json';
    })();

    // Source de démo publique (utilisée seulement si opts.demoMode)
    // Tears of Steel HLS (Mux test streams, libre de droits)
    var DEMO_HLS_URL = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

    var HLS_CDN = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js';

    // --------- Internals ---------

    var _mapping = null;
    var _mappingPromise = null;
    var _scriptPromises = {};

    function loadMapping(overrideUrl) {
        if (_mapping && !overrideUrl) return Promise.resolve(_mapping);
        if (_mappingPromise && !overrideUrl) return _mappingPromise;
        var url = overrideUrl || MAPPING_URL;
        var p = fetch(url)
            .then(function (r) {
                if (!r.ok) throw new Error('video-mapping.json HTTP ' + r.status);
                return r.json();
            })
            .then(function (j) { _mapping = j; return j; })
            .catch(function (e) { _mappingPromise = null; throw e; });
        _mappingPromise = p;
        return p;
    }

    function loadScript(src, key) {
        if (_scriptPromises[key]) return _scriptPromises[key];
        _scriptPromises[key] = new Promise(function (res, rej) {
            var existing = document.querySelector('script[data-cap-player-lib="' + key + '"]');
            if (existing) {
                if (existing.dataset.loaded === '1') return res();
                existing.addEventListener('load',  function () { res(); });
                existing.addEventListener('error', function () { rej(new Error('Load failed ' + key)); });
                return;
            }
            var s = document.createElement('script');
            s.src = src; s.async = true;
            s.dataset.capPlayerLib = key;
            s.addEventListener('load',  function () { s.dataset.loaded = '1'; res(); });
            s.addEventListener('error', function () { rej(new Error('Load failed ' + key)); });
            document.head.appendChild(s);
        });
        return _scriptPromises[key];
    }

    function ensureHls() {
        if (global.Hls) return Promise.resolve(global.Hls);
        return loadScript(HLS_CDN, 'hls').then(function () { return global.Hls; });
    }

    function findLesson(mapping, lessonId) {
        if (!mapping || !mapping.courses) return null;
        var courses = mapping.courses;
        for (var key in courses) {
            if (!Object.prototype.hasOwnProperty.call(courses, key)) continue;
            var lessons = courses[key].lessons || {};
            if (lessons[lessonId]) {
                return {
                    courseKey:   key,
                    courseTitle: courses[key].title,
                    lessonId:    lessonId,
                    data:        lessons[lessonId]
                };
            }
        }
        return null;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }

    // --------- Renderers ---------

    function clearContainer(el) {
        // Détruit l'instance hls.js précédente si présente
        if (el._capPlayerHls && typeof el._capPlayerHls.destroy === 'function') {
            try { el._capPlayerHls.destroy(); } catch (e) {}
            el._capPlayerHls = null;
        }
        // Coupe proprement un <video> en cours
        var prevVideo = el.querySelector('video.cap-player-video');
        if (prevVideo) {
            try { prevVideo.pause(); prevVideo.removeAttribute('src'); prevVideo.load(); } catch (e) {}
        }
        while (el.firstChild) el.removeChild(el.firstChild);
        el.classList.remove(
            'cap-player-pending',
            'cap-player-ready',
            'cap-player-error',
            'cap-player-demo'
        );
    }

    function renderState(el, icon, title, desc, stateClass) {
        clearContainer(el);
        if (stateClass) el.classList.add(stateClass);
        var wrap = document.createElement('div');
        wrap.className = 'cap-player-state';
        wrap.innerHTML =
            '<span class="cap-player-state-icon" aria-hidden="true">' + icon + '</span>' +
            '<p class="cap-player-state-title">' + escapeHtml(title) + '</p>' +
            '<p class="cap-player-state-desc">' + escapeHtml(desc) + '</p>';
        el.appendChild(wrap);
    }

    function renderPending(el, lesson) {
        var t = (lesson && lesson.data && lesson.data.title) || 'Cette leçon';
        renderState(
            el,
            '\uD83C\uDFAC',
            'Vidéo en cours de production',
            t + ' sera disponible très prochainement. Vous serez notifié·e par email.',
            'cap-player-pending'
        );
    }

    function renderError(el, msg) {
        renderState(
            el,
            '\u26A0\uFE0F',
            'Lecture impossible',
            msg || 'Une erreur est survenue lors du chargement de la vidéo.',
            'cap-player-error'
        );
    }

    function renderHLS(el, lesson, opts) {
        clearContainer(el);
        el.classList.add('cap-player-ready');

        var data = lesson.data;
        var url  = data.s3 && data.s3.master_url;
        if (!url) throw new Error('No HLS URL for lesson ' + lesson.lessonId);

        var video = buildVideoEl(data, opts);
        el.appendChild(video);
        attachVideoEvents(video, lesson, opts);

        // Safari / iOS : HLS natif (pas besoin de hls.js)
        if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
            return;
        }

        // Chrome / Firefox / Edge : hls.js
        ensureHls().then(function (Hls) {
            if (!Hls || !Hls.isSupported()) throw new Error('HLS non supporté par ce navigateur');
            var hls = new Hls({
                capLevelToPlayerSize: true,  // adapte le bitrate à la taille du lecteur
                enableWorker: true,          // décodage en Web Worker
                lowLatencyMode: false,       // VOD, pas de LL-HLS
                backBufferLength: 90         // mémoire tampon arrière en secondes
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.ERROR, function (evt, dat) {
                if (!dat || !dat.fatal) return;
                console.warn('[CapPlayer] HLS fatal', dat);
                // Récupération gracieuse selon le type d'erreur
                switch (dat.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR: hls.startLoad(); break;
                    case Hls.ErrorTypes.MEDIA_ERROR:   hls.recoverMediaError(); break;
                    default: renderError(el, 'Erreur de lecture — rechargez la page.');
                }
            });
            el._capPlayerHls = hls;
        }).catch(function (e) {
            console.error('[CapPlayer] hls.js load failed', e);
            renderError(el, 'Le lecteur HLS n\u2019a pas pu \u00eatre charg\u00e9.');
        });
    }

    function renderMp4(el, lesson, opts) {
        clearContainer(el);
        el.classList.add('cap-player-ready');

        var url = lesson.data.mp4 && lesson.data.mp4.url;
        if (!url) throw new Error('No MP4 URL for lesson ' + lesson.lessonId);

        var video = buildVideoEl(lesson.data, opts);
        video.src = url;
        el.appendChild(video);
        attachVideoEvents(video, lesson, opts);
    }

    function buildVideoEl(data, opts) {
        var v = document.createElement('video');
        v.className = 'cap-player-video';
        v.controls = true;
        v.playsInline = true;
        // Empêche le bouton "Télécharger" du menu natif (protection basique)
        v.setAttribute('controlslist', 'nodownload');
        v.setAttribute('disablepictureinpicture', '');
        v.setAttribute('preload', 'metadata');
        if (data.poster) v.poster = data.poster;
        if (opts && opts.autoplay) { v.autoplay = true; v.muted = true; }

        (data.subtitles || []).forEach(function (sub) {
            if (!sub || !sub.src) return;
            var t = document.createElement('track');
            t.kind = 'subtitles';
            t.src = sub.src;
            t.srclang = sub.lang || 'fr';
            t.label = sub.label || sub.lang || 'Sous-titres';
            if (sub.default) t.default = true;
            v.appendChild(t);
        });

        return v;
    }

    function attachVideoEvents(video, lesson, opts) {
        if (!opts) return;
        var total   = (lesson && lesson.data && lesson.data.duration_seconds) || 0;
        var lastPct = 0;
        if (opts.onProgress) {
            video.addEventListener('timeupdate', function () {
                var d = video.duration || total;
                if (!d) return;
                var pct = Math.max(0, Math.min(1, video.currentTime / d));
                // Throttle : callback tous les ~1 % de progression
                if (pct - lastPct >= 0.01 || pct >= 0.99) {
                    lastPct = pct;
                    opts.onProgress(pct, video.currentTime, d);
                }
            });
        }
        if (opts.onComplete) video.addEventListener('ended', function () { opts.onComplete(); });
        if (opts.onPlay)     video.addEventListener('play',  function () { opts.onPlay(); });
        if (opts.onPause)    video.addEventListener('pause', function () { opts.onPause(); });
        if (opts.onError)    video.addEventListener('error', function () { opts.onError(video.error); });
    }

    function renderDemo(el, baseLesson, opts) {
        var demoTitle = baseLesson && baseLesson.data && baseLesson.data.title
            ? baseLesson.data.title + ' (aperçu démo)'
            : 'Aperçu démo — HLS public';
        var fake = {
            courseKey:   'demo',
            courseTitle: 'Démonstration',
            lessonId:    (baseLesson && baseLesson.lessonId) || 'demo',
            data: {
                title:            demoTitle,
                status:           'live',
                provider:         'hls',
                s3:               { master_url: DEMO_HLS_URL },
                duration_seconds: 734,
                poster:           null,
                subtitles:        []
            }
        };
        renderHLS(el, fake, opts);
        el.classList.add('cap-player-demo');
        var tag = document.createElement('div');
        tag.className = 'cap-player-demo-tag';
        tag.textContent = 'Aperçu démo';
        el.appendChild(tag);
    }

    // --------- Public API ---------

    var CapPlayer = {
        version: '1.1.0',

        /**
         * Précharge le mapping (optionnel — mount le fera automatiquement).
         * @param {Object} [options]
         * @param {Object} [options.mapping]    Mapping pré-chargé à injecter
         * @param {string} [options.mappingUrl] URL alternative du mapping
         */
        init: function (options) {
            options = options || {};
            if (options.mapping) {
                _mapping = options.mapping;
                _mappingPromise = Promise.resolve(_mapping);
                return _mappingPromise;
            }
            return loadMapping(options.mappingUrl);
        },

        /**
         * Monte un lecteur vidéo pour la leçon donnée dans le container.
         * @param {HTMLElement|string} container  Élément DOM ou sélecteur/id
         * @param {string} lessonId               Clé du mapping (ex: 'l1-1')
         * @param {Object} [options]
         * @param {Function} [options.onProgress] (pct01, seconds, totalSec)
         * @param {Function} [options.onComplete] Appelée sur fin de vidéo
         * @param {Function} [options.onPlay]     Play
         * @param {Function} [options.onPause]    Pause
         * @param {Function} [options.onError]    Erreur média
         * @param {Function} [options.onPending]  Leçon non publiée (status !== 'live')
         * @param {boolean}  [options.demoMode]   Si true, force une vidéo démo publique
         * @param {boolean}  [options.autoplay]   Autoplay (muet, requis sur iOS)
         * @param {string}   [options.mappingUrl] URL alternative du mapping
         * @returns {Promise<{status: string, lesson?: object, error?: Error}>}
         */
        mount: function (container, lessonId, options) {
            var el = resolveEl(container);
            if (!el) return Promise.reject(new Error('Container not found'));
            options = options || {};

            // Unmount précédent
            this.unmount(el);

            return loadMapping(options.mappingUrl).then(function (mapping) {
                var lesson = findLesson(mapping, lessonId);

                if (!lesson) {
                    if (options.demoMode) { renderDemo(el, null, options); return { status: 'demo' }; }
                    renderError(el, 'Leçon « ' + lessonId + ' » introuvable dans le mapping.');
                    return { status: 'missing' };
                }

                var status = lesson.data.status || 'pending';
                if (status !== 'live') {
                    if (options.demoMode) {
                        renderDemo(el, lesson, options);
                        return { status: 'demo', lesson: lesson };
                    }
                    renderPending(el, lesson);
                    if (options.onPending) options.onPending(lesson);
                    return { status: 'pending', lesson: lesson };
                }

                var provider = lesson.data.provider || 'hls';
                try {
                    if (provider === 's3' || provider === 'hls') renderHLS(el, lesson, options);
                    else if (provider === 'mp4')                  renderMp4(el, lesson, options);
                    else throw new Error('Provider non supporté : ' + provider +
                                         ' (seuls hls/s3/mp4 sont acceptés)');
                } catch (e) {
                    console.error('[CapPlayer] render failed', e);
                    renderError(el, 'Source vidéo invalide.');
                    return { status: 'error', error: e };
                }
                return { status: 'ready', lesson: lesson };
            }).catch(function (e) {
                console.error('[CapPlayer] mount failed', e);
                if (options.demoMode) { renderDemo(el, null, options); return { status: 'demo' }; }
                renderError(el, 'Chargement impossible — vérifiez votre connexion.');
                return { status: 'error', error: e };
            });
        },

        /**
         * Démonte le lecteur (libère hls.js et vide le container).
         */
        unmount: function (container) {
            var el = resolveEl(container);
            if (!el) return;
            clearContainer(el);
        },

        /** Accès en lecture seule au mapping chargé (null si non chargé). */
        getMapping: function () { return _mapping; }
    };

    function resolveEl(ref) {
        if (!ref) return null;
        if (typeof ref === 'string') {
            if (ref.charAt(0) === '#') return document.getElementById(ref.slice(1));
            return document.querySelector(ref) || document.getElementById(ref);
        }
        return ref;
    }

    global.CapPlayer = CapPlayer;
})(window);
