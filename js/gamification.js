// ============================================================
// Cap Learning Gamification Engine
// Expert gamification: XP, Levels, Badges, Streaks, Celebrations
// ============================================================

const Gamification = (function() {
    'use strict';

    // ─── STORAGE ────────────────────────────────────────────
    const STORAGE_KEY = 'caplearning_gamification';

    function getData() {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return createDefaultData();
        try { return JSON.parse(raw); } catch(e) { return createDefaultData(); }
    }

    function saveData(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    }

    function createDefaultData() {
        const data = {
            xp: 0,
            totalXP: 0,
            badges: [],
            streak: { current: 0, best: 0, lastDate: null },
            dailyChallenge: { date: null, completed: false, type: null },
            history: [],
            createdAt: new Date().toISOString()
        };
        saveData(data);
        return data;
    }

    // ─── XP & LEVELS ────────────────────────────────────────
    // African-inspired level names
    const LEVELS = [
        { name: 'Graine',       icon: '🌱', minXP: 0,    color: '#94A3B8' },
        { name: 'Pousse',       icon: '🌿', minXP: 100,  color: '#10B981' },
        { name: 'Baobab',       icon: '🌳', minXP: 350,  color: '#059669' },
        { name: 'Étoile',       icon: '⭐', minXP: 700,  color: '#F59E0B' },
        { name: 'Flamme',       icon: '🔥', minXP: 1200, color: '#EF4444' },
        { name: 'Diamant',      icon: '💎', minXP: 2000, color: '#3B82F6' },
        { name: 'Légende',      icon: '🏆', minXP: 3500, color: '#8B5CF6' }
    ];

    // XP rewards table
    const XP_REWARDS = {
        video_complete:    10,
        exercise_pass:     20,
        exercise_perfect:  35,
        quiz_pass:         25,
        quiz_perfect:      45,
        module_complete:   60,
        course_complete:  150,
        streak_bonus:      15,  // per day in streak
        daily_challenge:   30,
        first_lesson:      20,
        retry_success:     10   // pass after failing
    };

    function getXP() {
        return getData().xp;
    }

    function getLevel() {
        const xp = getXP();
        let level = LEVELS[0];
        for (let i = LEVELS.length - 1; i >= 0; i--) {
            if (xp >= LEVELS[i].minXP) { level = LEVELS[i]; level.index = i; break; }
        }
        return level;
    }

    function getLevelProgress() {
        const xp = getXP();
        const level = getLevel();
        const nextLevel = LEVELS[level.index + 1];
        if (!nextLevel) return { current: xp, needed: 0, percent: 100, nextName: null };
        const progress = xp - level.minXP;
        const needed = nextLevel.minXP - level.minXP;
        return {
            current: progress,
            needed: needed,
            percent: Math.min(100, Math.round((progress / needed) * 100)),
            nextName: nextLevel.name,
            nextIcon: nextLevel.icon
        };
    }

    function addXP(amount, reason) {
        const data = getData();
        const oldLevel = getLevelFromXP(data.xp);
        data.xp += amount;
        data.totalXP += amount;
        data.history.push({ xp: amount, reason: reason, date: new Date().toISOString() });
        // Keep history manageable
        if (data.history.length > 100) data.history = data.history.slice(-100);
        saveData(data);

        const newLevel = getLevelFromXP(data.xp);
        const leveledUp = newLevel.index > oldLevel.index;

        return { amount, newXP: data.xp, leveledUp, newLevel, oldLevel };
    }

    function getLevelFromXP(xp) {
        let level = LEVELS[0]; level.index = 0;
        for (let i = LEVELS.length - 1; i >= 0; i--) {
            if (xp >= LEVELS[i].minXP) { level = { ...LEVELS[i], index: i }; break; }
        }
        return level;
    }

    // ─── BADGES ─────────────────────────────────────────────
    const ALL_BADGES = [
        { id: 'first_step',     name: 'Premier Pas',     icon: '🎯', desc: 'Complétez votre première leçon',         condition: 'auto' },
        { id: 'studious',       name: 'Étudiant Assidu',  icon: '📚', desc: 'Complétez 10 leçons',                    condition: 'auto' },
        { id: 'scholar',        name: 'Érudit',           icon: '🎓', desc: 'Complétez 25 leçons',                    condition: 'auto' },
        { id: 'fire_3',         name: 'En Feu',           icon: '🔥', desc: 'Série de 3 jours consécutifs',           condition: 'auto' },
        { id: 'unstoppable_7',  name: 'Inarrêtable',      icon: '⚡', desc: 'Série de 7 jours consécutifs',           condition: 'auto' },
        { id: 'legend_30',      name: 'Légendaire',        icon: '👑', desc: 'Série de 30 jours consécutifs',          condition: 'auto' },
        { id: 'perfect_quiz',   name: 'Génie',            icon: '🧠', desc: 'Score de 100% à un quiz',               condition: 'auto' },
        { id: 'graduate',       name: 'Diplômé',          icon: '🏅', desc: 'Terminez une formation complète',        condition: 'auto' },
        { id: 'comeback',       name: 'Persévérant',      icon: '💪', desc: 'Réussissez un exercice après un échec',  condition: 'auto' },
        { id: 'fast_learner',   name: 'Rapide',           icon: '⚡', desc: 'Complétez 5 leçons en une journée',      condition: 'auto' },
        { id: 'xp_500',         name: 'Demi-millier',     icon: '✨', desc: 'Atteignez 500 XP',                       condition: 'auto' },
        { id: 'xp_2000',        name: 'Maître',           icon: '💎', desc: 'Atteignez 2000 XP',                      condition: 'auto' }
    ];

    function getBadges() {
        return getData().badges || [];
    }

    function hasBadge(badgeId) {
        return getBadges().includes(badgeId);
    }

    function awardBadge(badgeId) {
        if (hasBadge(badgeId)) return null;
        const badge = ALL_BADGES.find(b => b.id === badgeId);
        if (!badge) return null;
        const data = getData();
        data.badges.push(badgeId);
        saveData(data);
        return badge;
    }

    function checkBadges(context) {
        const awarded = [];
        const data = getData();
        const progress = JSON.parse(localStorage.getItem('caplearning_progress') || '{}');
        let totalCompleted = 0;
        Object.values(progress).forEach(function(c) { totalCompleted += (c.completed || []).length; });

        // First step
        if (totalCompleted >= 1 && !hasBadge('first_step')) {
            var b = awardBadge('first_step'); if (b) awarded.push(b);
        }
        // Studious
        if (totalCompleted >= 10 && !hasBadge('studious')) {
            var b = awardBadge('studious'); if (b) awarded.push(b);
        }
        // Scholar
        if (totalCompleted >= 25 && !hasBadge('scholar')) {
            var b = awardBadge('scholar'); if (b) awarded.push(b);
        }
        // Streak badges
        if (data.streak.current >= 3 && !hasBadge('fire_3')) {
            var b = awardBadge('fire_3'); if (b) awarded.push(b);
        }
        if (data.streak.current >= 7 && !hasBadge('unstoppable_7')) {
            var b = awardBadge('unstoppable_7'); if (b) awarded.push(b);
        }
        if (data.streak.current >= 30 && !hasBadge('legend_30')) {
            var b = awardBadge('legend_30'); if (b) awarded.push(b);
        }
        // XP badges
        if (data.xp >= 500 && !hasBadge('xp_500')) {
            var b = awardBadge('xp_500'); if (b) awarded.push(b);
        }
        if (data.xp >= 2000 && !hasBadge('xp_2000')) {
            var b = awardBadge('xp_2000'); if (b) awarded.push(b);
        }
        // Perfect quiz
        if (context && context.type === 'quiz' && context.score === 100 && !hasBadge('perfect_quiz')) {
            var b = awardBadge('perfect_quiz'); if (b) awarded.push(b);
        }
        // Comeback
        if (context && context.type === 'retry_success' && !hasBadge('comeback')) {
            var b = awardBadge('comeback'); if (b) awarded.push(b);
        }
        // Graduate (check if any course is fully complete)
        Object.keys(progress).forEach(function(cid) {
            // Simple check: if progress.completed.length equals all lessons in course
            if (progress[cid] && progress[cid].completed && progress[cid].completed.length >= 6 && !hasBadge('graduate')) {
                var b = awardBadge('graduate'); if (b) awarded.push(b);
            }
        });

        return awarded;
    }

    // ─── STREAKS ────────────────────────────────────────────
    function getStreak() {
        const data = getData();
        return data.streak;
    }

    function updateStreak() {
        const data = getData();
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        if (data.streak.lastDate === today) {
            // Already logged today
            return { streak: data.streak, isNew: false };
        }

        if (data.streak.lastDate === yesterday) {
            // Consecutive day!
            data.streak.current += 1;
        } else if (data.streak.lastDate !== today) {
            // Streak broken (or first time)
            data.streak.current = 1;
        }

        if (data.streak.current > data.streak.best) {
            data.streak.best = data.streak.current;
        }
        data.streak.lastDate = today;
        saveData(data);

        return { streak: data.streak, isNew: true };
    }

    // ─── DAILY CHALLENGE ────────────────────────────────────
    const DAILY_CHALLENGES = [
        { type: 'complete_3',     text: 'Complétez 3 leçons aujourd\'hui',      xp: 30 },
        { type: 'perfect_exercise', text: 'Obtenez 100% à un exercice',         xp: 25 },
        { type: 'complete_module', text: 'Terminez un module complet',           xp: 50 },
        { type: 'study_20min',    text: 'Étudiez pendant 20 minutes',           xp: 20 },
        { type: 'complete_quiz',  text: 'Réussissez un quiz (≥60%)',            xp: 25 },
        { type: 'retry_improve',  text: 'Améliorez votre score sur un exercice', xp: 20 },
        { type: 'complete_5',     text: 'Complétez 5 leçons aujourd\'hui',      xp: 40 }
    ];

    function getDailyChallenge() {
        const data = getData();
        const today = new Date().toISOString().split('T')[0];

        if (data.dailyChallenge.date !== today) {
            // Generate new challenge based on day seed
            const dayNum = Math.floor(Date.now() / 86400000);
            const idx = dayNum % DAILY_CHALLENGES.length;
            data.dailyChallenge = {
                date: today,
                completed: false,
                ...DAILY_CHALLENGES[idx]
            };
            saveData(data);
        }

        return data.dailyChallenge;
    }

    function completeDailyChallenge() {
        const data = getData();
        if (data.dailyChallenge.completed) return null;
        data.dailyChallenge.completed = true;
        saveData(data);
        return data.dailyChallenge;
    }

    // ─── CELEBRATIONS UI ────────────────────────────────────

    // Inject CSS for celebrations (called once)
    function injectStyles() {
        if (document.getElementById('gamification-styles')) return;
        const style = document.createElement('style');
        style.id = 'gamification-styles';
        style.textContent = `
            /* XP Gain Toast */
            .xp-toast {
                position: fixed;
                top: 20px;
                right: 20px;
                background: linear-gradient(135deg, #3A50F6, #6B7DF8);
                color: white;
                padding: 12px 24px;
                border-radius: 16px;
                font-family: 'Satoshi', sans-serif;
                font-weight: 700;
                font-size: 16px;
                display: flex;
                align-items: center;
                gap: 10px;
                z-index: 10000;
                box-shadow: 0 8px 32px rgba(58,80,246,0.3);
                transform: translateX(120%);
                transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
            .xp-toast.show { transform: translateX(0); }
            .xp-toast .xp-amount {
                font-size: 24px;
                text-shadow: 0 2px 4px rgba(0,0,0,0.2);
            }
            .xp-toast .xp-reason {
                font-weight: 500;
                font-size: 13px;
                opacity: 0.9;
            }

            /* Level Up Modal */
            .levelup-overlay {
                position: fixed;
                inset: 0;
                background: rgba(0,0,0,0.6);
                backdrop-filter: blur(8px);
                z-index: 10001;
                display: flex;
                align-items: center;
                justify-content: center;
                opacity: 0;
                transition: opacity 0.3s;
            }
            .levelup-overlay.show { opacity: 1; }

            .levelup-modal {
                background: white;
                border-radius: 24px;
                padding: 48px 40px;
                text-align: center;
                max-width: 400px;
                width: 90%;
                transform: scale(0.5);
                transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                box-shadow: 0 24px 64px rgba(0,0,0,0.2);
            }
            .levelup-overlay.show .levelup-modal { transform: scale(1); }

            .levelup-icon {
                font-size: 72px;
                margin-bottom: 16px;
                animation: levelup-bounce 0.6s ease infinite alternate;
            }
            @keyframes levelup-bounce {
                from { transform: translateY(0); }
                to   { transform: translateY(-12px); }
            }

            .levelup-title {
                font-family: 'Satoshi', sans-serif;
                font-size: 28px;
                font-weight: 800;
                color: #1a1a2e;
                margin-bottom: 8px;
            }

            .levelup-subtitle {
                font-size: 18px;
                font-weight: 700;
                margin-bottom: 4px;
            }

            .levelup-desc {
                font-size: 14px;
                color: #64748B;
                margin-bottom: 24px;
            }

            .levelup-btn {
                background: linear-gradient(135deg, #3A50F6, #6B7DF8);
                color: white;
                border: none;
                padding: 14px 40px;
                border-radius: 14px;
                font-size: 16px;
                font-weight: 700;
                font-family: 'Satoshi', sans-serif;
                cursor: pointer;
                transition: transform 0.2s;
            }
            .levelup-btn:hover { transform: scale(1.05); }

            /* Badge Unlock Toast */
            .badge-toast {
                position: fixed;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%) translateY(120px);
                background: white;
                border: 2px solid #F59E0B;
                border-radius: 16px;
                padding: 16px 24px;
                display: flex;
                align-items: center;
                gap: 14px;
                z-index: 10000;
                box-shadow: 0 12px 40px rgba(0,0,0,0.15);
                transition: transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                max-width: 400px;
            }
            .badge-toast.show { transform: translateX(-50%) translateY(0); }

            .badge-toast-icon { font-size: 40px; }
            .badge-toast-content { flex: 1; }
            .badge-toast-label {
                font-size: 11px;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: #F59E0B;
                font-weight: 700;
                margin-bottom: 2px;
            }
            .badge-toast-name {
                font-family: 'Satoshi', sans-serif;
                font-weight: 700;
                font-size: 16px;
                color: #1a1a2e;
            }
            .badge-toast-desc {
                font-size: 12px;
                color: #64748B;
            }

            /* Confetti */
            .confetti-container {
                position: fixed;
                inset: 0;
                pointer-events: none;
                z-index: 10002;
                overflow: hidden;
            }
            .confetti-piece {
                position: absolute;
                width: 10px;
                height: 10px;
                top: -10px;
                opacity: 1;
                animation: confetti-fall linear forwards;
            }
            @keyframes confetti-fall {
                0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
                100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
            }

            /* XP Bar (for header/sidebar) */
            .gamif-xp-bar {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 8px 12px;
                background: rgba(255,255,255,0.05);
                border-radius: 12px;
                margin-top: 12px;
            }
            .gamif-level-icon { font-size: 20px; }
            .gamif-xp-track {
                flex: 1;
                height: 8px;
                background: rgba(255,255,255,0.1);
                border-radius: 4px;
                overflow: hidden;
            }
            .gamif-xp-fill {
                height: 100%;
                background: linear-gradient(90deg, #3A50F6, #6B7DF8);
                border-radius: 4px;
                transition: width 0.6s ease;
            }
            .gamif-xp-text {
                font-size: 11px;
                color: rgba(255,255,255,0.6);
                font-weight: 600;
                white-space: nowrap;
            }

            /* Streak indicator */
            .gamif-streak {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 6px 12px;
                border-radius: 10px;
                font-size: 13px;
                font-weight: 700;
                margin-top: 8px;
            }
            .gamif-streak.active {
                background: rgba(245,158,11,0.15);
                color: #F59E0B;
            }
            .gamif-streak.inactive {
                background: rgba(255,255,255,0.05);
                color: rgba(255,255,255,0.4);
            }
            .gamif-streak-fire { font-size: 18px; }

            /* Daily challenge card */
            .gamif-daily {
                padding: 12px 14px;
                background: rgba(58,80,246,0.08);
                border: 1px solid rgba(58,80,246,0.15);
                border-radius: 12px;
                margin-top: 12px;
            }
            .gamif-daily-label {
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: 0.06em;
                color: rgba(255,255,255,0.4);
                font-weight: 700;
                margin-bottom: 4px;
            }
            .gamif-daily-text {
                font-size: 13px;
                color: white;
                font-weight: 500;
                line-height: 1.3;
            }
            .gamif-daily-xp {
                font-size: 12px;
                color: #6B7DF8;
                font-weight: 700;
                margin-top: 4px;
            }
            .gamif-daily.completed {
                background: rgba(16,185,129,0.1);
                border-color: rgba(16,185,129,0.2);
            }
            .gamif-daily.completed .gamif-daily-text {
                text-decoration: line-through;
                opacity: 0.6;
            }
            .gamif-daily.completed .gamif-daily-xp { color: #10B981; }

            /* Dashboard gamification cards */
            .gamif-dashboard-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 16px;
                margin-bottom: 32px;
            }
            .gamif-stat-card {
                background: white;
                border: 1px solid #E2E8F0;
                border-radius: 16px;
                padding: 20px;
                text-align: center;
                transition: transform 0.2s, box-shadow 0.2s;
            }
            .gamif-stat-card:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 24px rgba(0,0,0,0.08);
            }
            .gamif-stat-icon { font-size: 36px; margin-bottom: 8px; }
            .gamif-stat-value {
                font-family: 'Satoshi', sans-serif;
                font-size: 28px;
                font-weight: 800;
                color: #1a1a2e;
            }
            .gamif-stat-label {
                font-size: 13px;
                color: #64748B;
                margin-top: 2px;
            }

            .gamif-level-card {
                background: linear-gradient(135deg, #3A50F6, #6B7DF8);
                color: white;
                border-radius: 16px;
                padding: 20px;
                text-align: center;
            }
            .gamif-level-card .gamif-stat-icon { filter: none; }
            .gamif-level-card .gamif-stat-value { color: white; }
            .gamif-level-card .gamif-stat-label { color: rgba(255,255,255,0.8); }

            .gamif-level-progress {
                margin-top: 12px;
                height: 8px;
                background: rgba(255,255,255,0.2);
                border-radius: 4px;
                overflow: hidden;
            }
            .gamif-level-progress-fill {
                height: 100%;
                background: white;
                border-radius: 4px;
                transition: width 0.6s ease;
            }
            .gamif-level-progress-text {
                font-size: 11px;
                margin-top: 6px;
                opacity: 0.8;
            }

            /* Badge collection */
            .gamif-badges-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
                gap: 12px;
                margin-top: 16px;
            }
            .gamif-badge-item {
                background: white;
                border: 2px solid #E2E8F0;
                border-radius: 14px;
                padding: 16px 12px;
                text-align: center;
                transition: all 0.2s;
            }
            .gamif-badge-item.unlocked {
                border-color: #F59E0B;
                background: #FFFBEB;
            }
            .gamif-badge-item.locked {
                opacity: 0.4;
                filter: grayscale(1);
            }
            .gamif-badge-icon { font-size: 32px; margin-bottom: 6px; }
            .gamif-badge-name {
                font-size: 13px;
                font-weight: 700;
                color: #1a1a2e;
                margin-bottom: 2px;
            }
            .gamif-badge-desc {
                font-size: 11px;
                color: #64748B;
                line-height: 1.3;
            }
        `;
        document.head.appendChild(style);
    }

    // Show XP gain toast
    function showXPToast(amount, reason) {
        // Remove existing toast
        var existing = document.querySelector('.xp-toast');
        if (existing) existing.remove();

        var toast = document.createElement('div');
        toast.className = 'xp-toast';
        toast.innerHTML = '<span class="xp-amount">+' + amount + ' XP</span><span class="xp-reason">' + reason + '</span>';
        document.body.appendChild(toast);

        requestAnimationFrame(function() {
            requestAnimationFrame(function() { toast.classList.add('show'); });
        });

        setTimeout(function() {
            toast.classList.remove('show');
            setTimeout(function() { toast.remove(); }, 400);
        }, 2500);
    }

    // Show level-up celebration
    function showLevelUp(level) {
        showConfetti();

        var overlay = document.createElement('div');
        overlay.className = 'levelup-overlay';
        overlay.innerHTML =
            '<div class="levelup-modal">' +
            '<div class="levelup-icon">' + level.icon + '</div>' +
            '<div class="levelup-title">Niveau supérieur !</div>' +
            '<div class="levelup-subtitle" style="color:' + level.color + '">Niveau ' + level.name + '</div>' +
            '<div class="levelup-desc">Continuez comme ça, vous êtes sur la voie du succès !</div>' +
            '<button class="levelup-btn" onclick="this.closest(\'.levelup-overlay\').remove()">Continuer 🚀</button>' +
            '</div>';
        document.body.appendChild(overlay);

        requestAnimationFrame(function() {
            requestAnimationFrame(function() { overlay.classList.add('show'); });
        });
    }

    // Show badge unlock toast
    function showBadgeUnlock(badge) {
        var existing = document.querySelector('.badge-toast');
        if (existing) existing.remove();

        var toast = document.createElement('div');
        toast.className = 'badge-toast';
        toast.innerHTML =
            '<div class="badge-toast-icon">' + badge.icon + '</div>' +
            '<div class="badge-toast-content">' +
            '<div class="badge-toast-label">🎉 Badge débloqué !</div>' +
            '<div class="badge-toast-name">' + badge.name + '</div>' +
            '<div class="badge-toast-desc">' + badge.desc + '</div>' +
            '</div>';
        document.body.appendChild(toast);

        requestAnimationFrame(function() {
            requestAnimationFrame(function() { toast.classList.add('show'); });
        });

        setTimeout(function() {
            toast.classList.remove('show');
            setTimeout(function() { toast.remove(); }, 500);
        }, 4000);
    }

    // Confetti effect
    function showConfetti() {
        var container = document.createElement('div');
        container.className = 'confetti-container';
        document.body.appendChild(container);

        var colors = ['#3A50F6', '#F59E0B', '#10B981', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4'];

        for (var i = 0; i < 60; i++) {
            (function(index) {
                setTimeout(function() {
                    var piece = document.createElement('div');
                    piece.className = 'confetti-piece';
                    piece.style.left = (Math.random() * 100) + '%';
                    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                    piece.style.width = (6 + Math.random() * 8) + 'px';
                    piece.style.height = (6 + Math.random() * 8) + 'px';
                    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
                    piece.style.animationDuration = (1.5 + Math.random() * 2) + 's';
                    piece.style.animationDelay = (Math.random() * 0.3) + 's';
                    container.appendChild(piece);
                }, index * 20);
            })(i);
        }

        setTimeout(function() { container.remove(); }, 5000);
    }

    // ─── SIDEBAR WIDGET ─────────────────────────────────────
    function renderSidebarWidget(containerEl) {
        if (!containerEl) return;
        var level = getLevel();
        var progress = getLevelProgress();
        var streak = getStreak();
        var daily = getDailyChallenge();

        var html =
            '<div class="gamif-xp-bar">' +
            '<span class="gamif-level-icon">' + level.icon + '</span>' +
            '<div class="gamif-xp-track"><div class="gamif-xp-fill" style="width:' + progress.percent + '%"></div></div>' +
            '<span class="gamif-xp-text">' + getXP() + ' XP</span>' +
            '</div>';

        html += '<div class="gamif-streak ' + (streak.current > 0 ? 'active' : 'inactive') + '">' +
            '<span class="gamif-streak-fire">🔥</span> ' +
            (streak.current > 0 ? streak.current + ' jour' + (streak.current > 1 ? 's' : '') + ' de série' : 'Aucune série') +
            '</div>';

        html += '<div class="gamif-daily' + (daily.completed ? ' completed' : '') + '">' +
            '<div class="gamif-daily-label">⚡ Défi du jour</div>' +
            '<div class="gamif-daily-text">' + (daily.completed ? '✅ ' : '') + daily.text + '</div>' +
            '<div class="gamif-daily-xp">' + (daily.completed ? 'Complété !' : '+' + daily.xp + ' XP bonus') + '</div>' +
            '</div>';

        containerEl.innerHTML = html;
    }

    // ─── DASHBOARD WIDGET ───────────────────────────────────
    function renderDashboardWidget(containerEl) {
        if (!containerEl) return;
        var level = getLevel();
        var progress = getLevelProgress();
        var streak = getStreak();
        var badges = getBadges();
        var daily = getDailyChallenge();

        var html =
            '<div class="gamif-dashboard-grid">' +
            // Level card
            '<div class="gamif-stat-card gamif-level-card">' +
            '<div class="gamif-stat-icon">' + level.icon + '</div>' +
            '<div class="gamif-stat-value">' + level.name + '</div>' +
            '<div class="gamif-stat-label">Niveau actuel · ' + getXP() + ' XP</div>' +
            (progress.nextName ?
                '<div class="gamif-level-progress"><div class="gamif-level-progress-fill" style="width:' + progress.percent + '%"></div></div>' +
                '<div class="gamif-level-progress-text">' + progress.current + '/' + progress.needed + ' XP vers ' + progress.nextIcon + ' ' + progress.nextName + '</div>'
                : '<div class="gamif-level-progress-text">Niveau maximum atteint !</div>') +
            '</div>' +
            // Streak card
            '<div class="gamif-stat-card">' +
            '<div class="gamif-stat-icon">🔥</div>' +
            '<div class="gamif-stat-value">' + streak.current + '</div>' +
            '<div class="gamif-stat-label">Jours de série' + (streak.best > streak.current ? ' · Record: ' + streak.best : '') + '</div>' +
            '</div>' +
            // Badges card
            '<div class="gamif-stat-card">' +
            '<div class="gamif-stat-icon">🏅</div>' +
            '<div class="gamif-stat-value">' + badges.length + '/' + ALL_BADGES.length + '</div>' +
            '<div class="gamif-stat-label">Badges débloqués</div>' +
            '</div>' +
            // Daily challenge card
            '<div class="gamif-stat-card">' +
            '<div class="gamif-stat-icon">⚡</div>' +
            '<div class="gamif-stat-value" style="font-size:16px;">' + (daily.completed ? '✅ Complété' : daily.text) + '</div>' +
            '<div class="gamif-stat-label">' + (daily.completed ? 'Revenez demain !' : 'Défi du jour · +' + daily.xp + ' XP') + '</div>' +
            '</div>' +
            '</div>';

        // Badge collection
        html += '<h3 style="font-family:Satoshi,sans-serif; font-size:18px; font-weight:700; margin-bottom:4px;">🏅 Collection de badges</h3>' +
            '<p style="font-size:13px; color:#64748B; margin-bottom:12px;">' + badges.length + ' sur ' + ALL_BADGES.length + ' badges débloqués</p>' +
            '<div class="gamif-badges-grid">';

        ALL_BADGES.forEach(function(badge) {
            var unlocked = badges.includes(badge.id);
            html += '<div class="gamif-badge-item ' + (unlocked ? 'unlocked' : 'locked') + '">' +
                '<div class="gamif-badge-icon">' + badge.icon + '</div>' +
                '<div class="gamif-badge-name">' + badge.name + '</div>' +
                '<div class="gamif-badge-desc">' + badge.desc + '</div>' +
                '</div>';
        });

        html += '</div>';
        containerEl.innerHTML = html;
    }

    // ─── PUBLIC API ─────────────────────────────────────────
    return {
        // Core
        getXP: getXP,
        addXP: addXP,
        getLevel: getLevel,
        getLevelProgress: getLevelProgress,
        XP_REWARDS: XP_REWARDS,
        LEVELS: LEVELS,

        // Badges
        ALL_BADGES: ALL_BADGES,
        getBadges: getBadges,
        hasBadge: hasBadge,
        awardBadge: awardBadge,
        checkBadges: checkBadges,

        // Streaks
        getStreak: getStreak,
        updateStreak: updateStreak,

        // Daily
        getDailyChallenge: getDailyChallenge,
        completeDailyChallenge: completeDailyChallenge,

        // UI
        injectStyles: injectStyles,
        showXPToast: showXPToast,
        showLevelUp: showLevelUp,
        showBadgeUnlock: showBadgeUnlock,
        showConfetti: showConfetti,
        renderSidebarWidget: renderSidebarWidget,
        renderDashboardWidget: renderDashboardWidget
    };
})();
