/* ============================================
   Cap Learning - Main Application JS
   Cart, Navigation, Filters, Animations
   ============================================ */

// --- Cart State ---
const Cart = {
    items: JSON.parse(localStorage.getItem('caplearning_cart') || '[]'),

    save() {
        localStorage.setItem('caplearning_cart', JSON.stringify(this.items));
        this.updateBadge();
    },

    add(item) {
        if (!this.items.find(i => i.id === item.id)) {
            this.items.push(item);
            this.save();
            return true;
        }
        return false;
    },

    remove(id) {
        this.items = this.items.filter(i => i.id !== id);
        this.save();
    },

    getTotal() {
        return this.items.reduce((sum, item) => sum + item.price, 0);
    },

    getCount() {
        return this.items.length;
    },

    clear() {
        this.items = [];
        this.save();
    },

    updateBadge() {
        const badges = document.querySelectorAll('#cart-badge');
        badges.forEach(badge => {
            const count = this.getCount();
            badge.textContent = count;
            badge.style.display = count > 0 ? 'flex' : 'none';
        });
    }
};

// --- Toast Notifications ---
function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-message');
    if (!toast || !toastMsg) return;

    toastMsg.textContent = message;
    toast.hidden = false;

    clearTimeout(window._toastTimeout);
    window._toastTimeout = setTimeout(() => {
        toast.hidden = true;
    }, 3500);
}

function hideToast() {
    const toast = document.getElementById('toast');
    if (toast) toast.hidden = true;
}

// --- Add to Cart Buttons ---
function initAddToCartButtons() {
    document.querySelectorAll('.add-to-cart-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = btn.closest('.course-card') || btn.closest('[data-id]');
            if (!card) return;

            const item = {
                id: card.dataset.id,
                name: card.dataset.name,
                price: parseInt(card.dataset.price, 10),
                category: card.dataset.category || ''
            };

            if (Cart.add(item)) {
                btn.textContent = 'Ajouté au panier !';
                btn.classList.add('added');
                showToast(`"${item.name}" ajouté au panier`);

                setTimeout(() => {
                    btn.textContent = 'Acheter cette formation';
                    btn.classList.remove('added');
                }, 2000);
            } else {
                showToast('Cette formation est déjà dans votre panier');
            }
        });
    });
}

// --- Header Scroll Effect ---
function initHeaderScroll() {
    const header = document.getElementById('header');
    if (!header) return;

    let lastScroll = 0;
    window.addEventListener('scroll', () => {
        const currentScroll = window.scrollY;
        if (currentScroll > 20) {
            header.classList.add('scrolled');
        } else {
            header.classList.remove('scrolled');
        }
        lastScroll = currentScroll;
    }, { passive: true });
}

// --- Mobile Menu Toggle ---
function initMobileMenu() {
    const toggle = document.querySelector('.mobile-menu-toggle');
    const mobileNav = document.querySelector('.mobile-nav');
    if (!toggle || !mobileNav) return;

    toggle.addEventListener('click', () => {
        const isOpen = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', !isOpen);
        mobileNav.hidden = isOpen;

        if (!isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
    });

    // Close on link click
    mobileNav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            toggle.setAttribute('aria-expanded', 'false');
            mobileNav.hidden = true;
            document.body.style.overflow = '';
        });
    });
}

// --- Nav Dropdown (keyboard support) ---
function initNavDropdowns() {
    document.querySelectorAll('.nav-dropdown-trigger').forEach(trigger => {
        trigger.addEventListener('click', (e) => {
            e.preventDefault();
            const expanded = trigger.getAttribute('aria-expanded') === 'true';
            trigger.setAttribute('aria-expanded', !expanded);
        });

        // Close on outside click
        document.addEventListener('click', (e) => {
            if (!trigger.closest('.nav-dropdown').contains(e.target)) {
                trigger.setAttribute('aria-expanded', 'false');
            }
        });
    });
}

// --- Course Filter ---
function initCourseFilter() {
    const filterBtns = document.querySelectorAll('.filter-btn');
    const courseCards = document.querySelectorAll('.course-card');
    if (!filterBtns.length || !courseCards.length) return;

    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const filter = btn.dataset.filter;

            // Update active state
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Filter cards with animation
            courseCards.forEach(card => {
                const category = card.dataset.category;
                const shouldShow = filter === 'all' || category === filter;

                if (shouldShow) {
                    card.style.display = '';
                    card.style.opacity = '0';
                    card.style.transform = 'translateY(16px)';
                    requestAnimationFrame(() => {
                        card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
                        card.style.opacity = '1';
                        card.style.transform = 'translateY(0)';
                    });
                } else {
                    card.style.display = 'none';
                }
            });
        });
    });
}

// --- Stats Counter Animation ---
function initStatsCounter() {
    const statNumbers = document.querySelectorAll('.stat-number[data-target]');
    if (!statNumbers.length) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const el = entry.target;
                const target = parseInt(el.dataset.target, 10);
                animateCounter(el, target);
                observer.unobserve(el);
            }
        });
    }, { threshold: 0.5 });

    statNumbers.forEach(el => observer.observe(el));
}

function animateCounter(el, target) {
    const duration = 2000;
    const start = performance.now();

    function update(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        el.textContent = Math.floor(target * eased).toLocaleString('fr-FR');

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            el.textContent = target.toLocaleString('fr-FR');
        }
    }

    requestAnimationFrame(update);
}

// --- Scroll Reveal Animation ---
function initScrollReveal() {
    const revealElements = document.querySelectorAll(
        '.step-card, .course-card, .testimonial-card, .pricing-card, .faq-item, .stat-card'
    );

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, index) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }, index * 80);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    revealElements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(24px)';
        el.style.transition = 'opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
        observer.observe(el);
    });
}

// --- Newsletter Form ---
function initNewsletter() {
    const form = document.getElementById('newsletter-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = form.querySelector('input[type="email"]');
        if (email && email.value) {
            showToast('Merci ! Vérifiez votre boîte email pour votre mini-formation gratuite.');
            email.value = '';
        }
    });
}

// --- Wishlist Toggle ---
function initWishlist() {
    document.querySelectorAll('.course-wishlist').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            btn.classList.toggle('active');
            if (btn.classList.contains('active')) {
                btn.innerHTML = '&#9829;';
                showToast('Ajouté aux favoris');
            } else {
                btn.innerHTML = '&#9825;';
            }
        });
    });
}

// --- Cart Page Rendering ---
function initCartPage() {
    const cartItemsContainer = document.getElementById('cart-items');
    const cartEmptyState = document.getElementById('cart-empty');
    const cartContent = document.getElementById('cart-content');

    if (!cartItemsContainer) return;

    function renderCart() {
        const items = Cart.items;

        if (items.length === 0) {
            if (cartContent) cartContent.style.display = 'none';
            if (cartEmptyState) cartEmptyState.style.display = 'block';
            return;
        }

        if (cartContent) cartContent.style.display = 'grid';
        if (cartEmptyState) cartEmptyState.style.display = 'none';

        const gradients = {
            marketing: 'linear-gradient(135deg, #FF6B35, #F7931E)',
            ecommerce: 'linear-gradient(135deg, #2D9CDB, #56CCF2)',
            ia: 'linear-gradient(135deg, #A855F7, #6366F1)',
            finance: 'linear-gradient(135deg, #10B981, #34D399)'
        };

        const icons = {
            marketing: '&#128187;',
            ecommerce: '&#128722;',
            ia: '&#129302;',
            finance: '&#128200;'
        };

        cartItemsContainer.innerHTML = items.map(item => `
            <div class="cart-item" data-id="${item.id}">
                <div class="cart-item-image" style="background: ${gradients[item.category] || gradients.marketing}">
                    ${icons[item.category] || '&#128218;'}
                </div>
                <div class="cart-item-info">
                    <h3>${item.name}</h3>
                    <p>Formation complète avec certificat</p>
                    <span class="cart-item-price">${item.price.toLocaleString('fr-FR')} FCFA</span>
                </div>
                <button class="cart-item-remove" data-id="${item.id}" aria-label="Retirer du panier">
                    &#10005; Retirer
                </button>
            </div>
        `).join('');

        // Update summary
        const subtotal = Cart.getTotal();
        const subtotalEl = document.getElementById('cart-subtotal');
        const totalEl = document.getElementById('cart-total');
        const countEl = document.getElementById('cart-count');

        if (subtotalEl) subtotalEl.textContent = `${subtotal.toLocaleString('fr-FR')} FCFA`;
        if (totalEl) totalEl.textContent = `${subtotal.toLocaleString('fr-FR')} FCFA`;
        if (countEl) countEl.textContent = `${items.length} formation${items.length > 1 ? 's' : ''}`;

        // Remove buttons
        document.querySelectorAll('.cart-item-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.dataset.id;
                Cart.remove(id);
                showToast('Formation retirée du panier');
                renderCart();
            });
        });
    }

    renderCart();
}

// --- Format Price ---
function formatPrice(price) {
    return price.toLocaleString('fr-FR') + ' FCFA';
}

// --- Initialize Everything ---
document.addEventListener('DOMContentLoaded', () => {
    Cart.updateBadge();
    initAddToCartButtons();
    initHeaderScroll();
    initMobileMenu();
    initNavDropdowns();
    initCourseFilter();
    initStatsCounter();
    initScrollReveal();
    initNewsletter();
    initWishlist();
    initCartPage();
});
