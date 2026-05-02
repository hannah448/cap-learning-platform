/* ================================================================
 * Cap Learning — Admin Data Layer
 * Persiste utilisateurs, inscriptions et session dans localStorage.
 * Seed automatique d'un compte admin + apprenants démo au premier
 * chargement pour que le panel soit immédiatement utilisable.
 * ================================================================ */
(function () {
    'use strict';

    const STORAGE = {
        users: 'caplearning_users',
        enrollments: 'caplearning_enrollments',
        session: 'caplearning_session',
        seeded: 'caplearning_seeded_v5'   // v5 → Refonte 5 parcours certifiants marché africain
    };

    // Méthodes de paiement affichées dans l'admin (clé → libellé)
    const PAYMENT_METHODS = {
        'mobile_money': 'Mobile Money',
        'card':         'Carte bancaire',
        'orange_money': 'Orange Money',
        'wave':         'Wave',
        'stripe':       'Stripe',
        'bank':         'Virement bancaire'
    };

    // Statuts possibles d'une transaction
    const PAYMENT_STATUS = {
        'paid':     { label: 'Payé',     tone: 'success' },
        'refunded': { label: 'Remboursé', tone: 'danger'  },
        'pending':  { label: 'En attente', tone: 'warning' },
        'failed':   { label: 'Échoué',    tone: 'danger'  }
    };

    // Catalogue source de vérité (synchro avec les pages de formation)
    // Refonte 2026 : 5 parcours certifiants pour le marché africain.
    // Cap Learning délivre uniquement des certificats de complétion Cap Learning
    // (pas de référentiel spécifique externe côté public).
    // - No-Code (ex id '7') absorbé par IA & Business (id '3')
    // - Email Marketing (ex id '8') absorbé par Marketing Digital (id '1')
    // - Mobile Money (ex id '6') fusionné dans E-commerce (id '2')
    // - Ajout Entrepreneuriat Digital (id '10')
    const CATALOG = [
        { id: '1',  name: 'Marketing Digital Complet pour Entrepreneurs',  price: 25000, category: 'marketing',     page: 'formation-marketing-digital.html',    duration: 57, modules: 16 },
        { id: '2',  name: 'E-commerce & Paiements Digitaux',               price: 30000, category: 'ecommerce',     page: 'formation-ecommerce.html',            duration: 79, modules: 47 },
        { id: '3',  name: 'IA & Business : Automatisation & Productivité', price: 30000, category: 'ia',            page: 'formation-ia-business.html',          duration: 48, modules: 26 },
        { id: '5',  name: 'Réseaux Sociaux & Community Management',        price: 18000, category: 'marketing',     page: 'formation-reseaux-sociaux.html',      duration: 41, modules: 25 },
        { id: '10', name: 'Entrepreneuriat Digital',                       price: 25000, category: 'entrepreneuriat', page: 'formation-entrepreneuriat-digital.html', duration: 50, modules: 20 }
    ];

    const ADMIN_EMAILS = ['hannah@digi-atlas.com'];

    // Préfixes utilisés pour générer les identifiants de certificat
    const CERT_PREFIX = { '1': 'MKT', '2': 'EC', '3': 'IA', '5': 'RS', '10': 'ENT' };

    // Seed initial (une seule fois) ---------------------------------
    function seedIfNeeded() {
        if (localStorage.getItem(STORAGE.seeded)) return;

        const seedUsers = [
            { id: 'u1', email: 'hannah@digi-atlas.com', name: 'Hannah Peters',   phone: '+33 6 12 34 56 78', country: 'France',       role: 'admin',   createdAt: '2026-01-05T09:00:00Z', lastLogin: new Date().toISOString(), avatar: 'HP' },
            { id: 'u2', email: 'amadou.diop@exemple.sn',  name: 'Amadou Diop',     phone: '+221 77 123 45 67', country: 'Sénégal',      role: 'learner', createdAt: '2026-02-10T14:22:00Z', lastLogin: '2026-04-14T16:20:00Z', avatar: 'AD' },
            { id: 'u3', email: 'fatou.sall@exemple.sn',   name: 'Fatou Sall',      phone: '+221 78 555 88 99', country: 'Sénégal',      role: 'learner', createdAt: '2026-02-28T10:15:00Z', lastLogin: '2026-04-15T08:05:00Z', avatar: 'FS' },
            { id: 'u4', email: 'kwame.osei@exemple.gh',   name: 'Kwame Osei',      phone: '+233 24 777 33 22', country: 'Ghana',        role: 'learner', createdAt: '2026-03-12T17:40:00Z', lastLogin: '2026-04-13T21:10:00Z', avatar: 'KO' },
            { id: 'u5', email: 'nadia.mensah@exemple.ci', name: 'Nadia Mensah',    phone: '+225 07 88 11 22 33', country: 'Côte d\'Ivoire', role: 'learner', createdAt: '2026-03-20T11:00:00Z', lastLogin: '2026-04-16T07:30:00Z', avatar: 'NM' },
            { id: 'u6', email: 'youssef.sow@exemple.sn',  name: 'Youssef Sow',     phone: '+221 76 222 44 55', country: 'Sénégal',      role: 'learner', createdAt: '2026-04-02T09:20:00Z', lastLogin: '2026-04-11T14:50:00Z', avatar: 'YS' },
            { id: 'u7', email: 'aisha.coulibaly@exemple.ml', name: 'Aïsha Coulibaly', phone: '+223 76 98 11 22', country: 'Mali',        role: 'learner', createdAt: '2026-04-08T16:00:00Z', lastLogin: '2026-04-10T10:00:00Z', avatar: 'AC' }
        ];

        // Helper pour générer des résultats d'exercices cohérents avec la progression
        const ex = (id, module, title, type, correct, total, attempts, completedAt) => ({
            id, module, title, type,
            correct, total,
            scorePct: Math.round((correct / total) * 100),
            attempts,
            completedAt
        });

        // Génère un orderId lisible : ORD-YYYY-XXXX
        const orderId = (date, seq) => {
            const y = new Date(date).getFullYear();
            const num = String(seq).padStart(4, '0');
            return `ORD-${y}-${num}`;
        };

        // Raccourci pour créer un bloc de paiement cohérent
        const pay = (amount, paidAt, method, seq, status) => ({
            amount,
            paidAt,
            paymentMethod: method,
            paymentStatus: status || 'paid',
            orderId: orderId(paidAt, seq)
        });

        const seedEnrollments = [
            // --- Amadou : Marketing Digital, bien avancé (progress 72, grade attribué)
            { id: 'e1', userId: 'u2', courseId: '1', assignedAt: '2026-02-11T10:00:00Z', assignedBy: 'self-purchase',
              ...pay(25000, '2026-02-11T10:00:00Z', 'mobile_money', 1042),
              progress: 72, lastActivity: '2026-04-14T16:20:00Z', status: 'active',
              certified: false, grade: null, certifiedAt: null, certificateId: null,
              exerciseResults: [
                  ex('e1-q1', 'Module 1 : Fondamentaux du marketing digital', 'Quiz : Les 4P du marketing', 'quiz', 9, 10, 1, '2026-02-16T14:20:00Z'),
                  ex('e1-tf1', 'Module 1', 'Vrai/Faux : Concepts clés', 'true_false', 4, 5, 2, '2026-02-18T10:00:00Z'),
                  ex('e1-q2', 'Module 2 : SEO & Référencement', 'Quiz : Techniques SEO', 'quiz', 7, 10, 2, '2026-02-25T16:30:00Z'),
                  ex('e1-m1', 'Module 2', 'Association : Outils SEO', 'matching', 8, 10, 1, '2026-03-01T11:15:00Z'),
                  ex('e1-fb1', 'Module 3 : Publicité payante', 'Texte à trous : Google Ads', 'fill_blank', 6, 8, 3, '2026-03-10T09:40:00Z'),
                  ex('e1-q3', 'Module 3', 'Quiz : Campagnes Meta Ads', 'quiz', 8, 10, 1, '2026-03-18T15:00:00Z'),
                  ex('e1-op1', 'Module 4 : Stratégie de contenu', 'Rédaction : Brief éditorial', 'open', 16, 20, 1, '2026-03-28T17:30:00Z'),
                  ex('e1-q4', 'Module 5 : Email marketing', 'Quiz : Segmentation', 'quiz', 9, 10, 1, '2026-04-10T14:20:00Z')
              ]
            },
            // --- Amadou : IA & Business (ex-No-Code absorbé) (progress 38)
            { id: 'e2', userId: 'u2', courseId: '3', assignedAt: '2026-03-15T14:00:00Z', assignedBy: 'self-purchase',
              ...pay(30000, '2026-03-15T14:00:00Z', 'card', 1078),
              migratedFrom: '7',   // ancien achat No-Code fusionné dans IA & Business
              progress: 38, lastActivity: '2026-04-13T11:00:00Z', status: 'active',
              certified: false, grade: null, certifiedAt: null, certificateId: null,
              exerciseResults: [
                  ex('e2-q1', 'Module 1 : Fondamentaux IA & No-Code', 'Quiz : Panorama des outils', 'quiz', 8, 10, 1, '2026-03-17T10:00:00Z'),
                  ex('e2-tf1', 'Module 1', 'Vrai/Faux : IA générative', 'true_false', 3, 4, 2, '2026-03-19T14:30:00Z'),
                  ex('e2-m1', 'Module 2 : Lovable en pratique', 'Association : Composants Lovable', 'matching', 7, 10, 1, '2026-03-28T16:00:00Z'),
                  ex('e2-q2', 'Module 3 : N8N & automatisations', 'Quiz : Workflows N8N', 'quiz', 6, 10, 2, '2026-04-08T11:20:00Z')
              ]
            },
            // --- Fatou : Réseaux Sociaux & CM, débutante (progress 18)
            { id: 'e3', userId: 'u3', courseId: '5', assignedAt: '2026-03-01T09:00:00Z', assignedBy: 'self-purchase',
              ...pay(18000, '2026-03-01T09:00:00Z', 'orange_money', 1061),
              progress: 18, lastActivity: '2026-04-15T08:05:00Z', status: 'active',
              certified: false, grade: null, certifiedAt: null, certificateId: null,
              exerciseResults: [
                  ex('e3-q1', 'Module 1 : Stratégie réseaux sociaux', 'Quiz : Choisir ses plateformes', 'quiz', 7, 10, 1, '2026-03-05T10:00:00Z'),
                  ex('e3-tf1', 'Module 1', 'Vrai/Faux : Audiences', 'true_false', 3, 5, 1, '2026-03-12T14:20:00Z')
              ]
            },
            // --- Kwame : E-commerce & Paiements, très avancé → certifié (progress 92)
            { id: 'e4', userId: 'u4', courseId: '2', assignedAt: '2026-03-13T10:00:00Z', assignedBy: 'self-purchase',
              ...pay(30000, '2026-03-13T10:00:00Z', 'card', 1075),
              progress: 92, lastActivity: '2026-04-13T21:10:00Z', status: 'active',
              certified: true, grade: 16, certifiedAt: '2026-04-12T18:00:00Z', certificateId: 'AFL-2026-EC-0042',
              exerciseResults: [
                  ex('e4-q1', 'Module 1 : Créer sa boutique', 'Quiz : Plateformes e-commerce', 'quiz', 10, 10, 1, '2026-03-15T10:00:00Z'),
                  ex('e4-m1', 'Module 1', 'Association : Shopify vs WooCommerce', 'matching', 9, 10, 1, '2026-03-18T14:00:00Z'),
                  ex('e4-q2', 'Module 2 : Produits & catalogue', 'Quiz : Optimiser les fiches produits', 'quiz', 8, 10, 1, '2026-03-22T11:00:00Z'),
                  ex('e4-tf1', 'Module 2', 'Vrai/Faux : Pricing psychology', 'true_false', 5, 5, 1, '2026-03-25T16:20:00Z'),
                  ex('e4-fb1', 'Module 3 : Paiements & livraison', 'Texte à trous : Mobile Money', 'fill_blank', 7, 8, 2, '2026-03-29T10:15:00Z'),
                  ex('e4-q3', 'Module 3', 'Quiz : Logistique Afrique', 'quiz', 9, 10, 1, '2026-04-02T14:30:00Z'),
                  ex('e4-op1', 'Module 4 : Marketing & acquisition', 'Rédaction : Tunnel d\'acquisition', 'open', 17, 20, 1, '2026-04-06T09:40:00Z'),
                  ex('e4-q4', 'Module 5 : Fidélisation', 'Quiz : Email & retargeting', 'quiz', 8, 10, 1, '2026-04-09T11:00:00Z'),
                  ex('e4-ef1', 'Module 6 : Analyse & scaling', 'Examen final : E-commerce complet', 'exam', 32, 40, 1, '2026-04-12T17:30:00Z')
              ]
            },
            // --- Kwame : IA Business (progress 45, attribué par admin)
            { id: 'e5', userId: 'u4', courseId: '3', assignedAt: '2026-03-25T14:00:00Z', assignedBy: 'u1',
              progress: 45, lastActivity: '2026-04-12T19:30:00Z', status: 'active',
              certified: false, grade: null, certifiedAt: null, certificateId: null,
              exerciseResults: [
                  ex('e5-q1', 'Module 1 : Introduction à l\'IA', 'Quiz : ChatGPT, Claude, Gemini', 'quiz', 9, 10, 1, '2026-03-27T10:00:00Z'),
                  ex('e5-tf1', 'Module 1', 'Vrai/Faux : Capacités des LLM', 'true_false', 4, 5, 1, '2026-03-29T14:00:00Z'),
                  ex('e5-m1', 'Module 2 : Prompt engineering', 'Association : Techniques de prompt', 'matching', 8, 10, 2, '2026-04-04T11:30:00Z'),
                  ex('e5-q2', 'Module 2', 'Quiz : Few-shot & Chain-of-thought', 'quiz', 7, 10, 2, '2026-04-10T16:00:00Z')
              ]
            },
            // --- Kwame : Marketing Digital (module email fusionné) (progress 12)
            { id: 'e6', userId: 'u4', courseId: '1', assignedAt: '2026-04-05T11:00:00Z', assignedBy: 'u1',
              migratedFrom: '8',   // ancien Email Marketing fusionné dans Marketing Digital
              progress: 12, lastActivity: '2026-04-13T21:10:00Z', status: 'active',
              certified: false, grade: null, certifiedAt: null, certificateId: null,
              exerciseResults: [
                  ex('e6-q1', 'Module 13 : Email marketing', 'Quiz : Bases de l\'emailing', 'quiz', 7, 10, 1, '2026-04-08T10:00:00Z')
              ]
            },
            // --- Youssef : E-commerce & Paiements (ex-Mobile Money fusionné), décroche (progress 8)
            { id: 'e8', userId: 'u6', courseId: '2', assignedAt: '2026-04-02T10:00:00Z', assignedBy: 'self-purchase',
              ...pay(18000, '2026-04-02T10:00:00Z', 'mobile_money', 1104),
              migratedFrom: '6',   // ancien achat Mobile Money — tarif historique conservé
              progress: 8, lastActivity: '2026-04-11T14:50:00Z', status: 'at_risk',
              certified: false, grade: null, certifiedAt: null, certificateId: null,
              exerciseResults: [
                  ex('e8-q1', 'Module 7 : Écosystème des paiements en Afrique', 'Quiz : Acteurs du marché', 'quiz', 5, 10, 3, '2026-04-06T14:00:00Z')
              ]
            },
            // --- Aïsha : IA Business, démarre
            { id: 'e9', userId: 'u7', courseId: '3', assignedAt: '2026-04-09T17:00:00Z', assignedBy: 'self-purchase',
              ...pay(30000, '2026-04-09T17:00:00Z', 'card', 1118),
              progress: 5, lastActivity: '2026-04-10T10:00:00Z', status: 'active',
              certified: false, grade: null, certifiedAt: null, certificateId: null,
              exerciseResults: [
                  ex('e9-q1', 'Module 1 : Introduction à l\'IA', 'Quiz : ChatGPT, Claude, Gemini', 'quiz', 6, 10, 1, '2026-04-10T09:30:00Z')
              ]
            },

            // ============================================================
            // Historique étalé sur 12 mois — anciens clients (archived).
            // Permet de peupler le graphique d'évolution & le journal des
            // ventes avec des données réalistes. userId pointe sur un
            // pseudo-utilisateur "alumni" généré au seed.
            // ============================================================
            { id: 'h01', userId: 'a1', courseId: '1', assignedAt: '2025-05-08T11:00:00Z', assignedBy: 'self-purchase',
              ...pay(25000, '2025-05-08T11:00:00Z', 'mobile_money', 201),
              progress: 100, lastActivity: '2025-06-12T10:00:00Z', status: 'archived',
              certified: true, grade: 15, certifiedAt: '2025-06-12T10:00:00Z', certificateId: 'AFL-2025-MKT-0201',
              exerciseResults: []
            },
            { id: 'h02', userId: 'a2', courseId: '3', assignedAt: '2025-06-22T14:30:00Z', assignedBy: 'self-purchase',
              ...pay(35000, '2025-06-22T14:30:00Z', 'card', 215),
              progress: 88, lastActivity: '2025-08-03T16:00:00Z', status: 'archived',
              certified: true, grade: 16, certifiedAt: '2025-08-03T16:00:00Z', certificateId: 'AFL-2025-IA-0215',
              exerciseResults: []
            },
            { id: 'h03', userId: 'a3', courseId: '2', assignedAt: '2025-07-04T09:00:00Z', assignedBy: 'self-purchase',
              ...pay(30000, '2025-07-04T09:00:00Z', 'wave', 228),
              progress: 100, lastActivity: '2025-08-28T11:00:00Z', status: 'archived',
              certified: true, grade: 18, certifiedAt: '2025-08-28T11:00:00Z', certificateId: 'AFL-2025-EC-0228',
              exerciseResults: []
            },
            { id: 'h04', userId: 'a4', courseId: '5', assignedAt: '2025-07-18T10:00:00Z', assignedBy: 'self-purchase',
              ...pay(15000, '2025-07-18T10:00:00Z', 'orange_money', 234),
              progress: 100, lastActivity: '2025-08-15T14:00:00Z', status: 'archived',
              certified: true, grade: 14, certifiedAt: '2025-08-15T14:00:00Z', certificateId: 'AFL-2025-RS-0234',
              exerciseResults: []
            },
            { id: 'h05', userId: 'a5', courseId: '3', assignedAt: '2025-08-11T15:20:00Z', assignedBy: 'self-purchase',
              ...pay(22000, '2025-08-11T15:20:00Z', 'card', 247),
              migratedFrom: '7',
              progress: 45, lastActivity: '2025-09-20T12:00:00Z', status: 'archived',
              certified: false, grade: null, certifiedAt: null, certificateId: null,
              exerciseResults: []
            },
            { id: 'h06', userId: 'a6', courseId: '1', assignedAt: '2025-08-25T08:00:00Z', assignedBy: 'self-purchase',
              ...pay(18000, '2025-08-25T08:00:00Z', 'mobile_money', 251),
              migratedFrom: '8',
              progress: 100, lastActivity: '2025-09-28T10:00:00Z', status: 'archived',
              certified: true, grade: 17, certifiedAt: '2025-09-28T10:00:00Z', certificateId: 'AFL-2025-MKT-0251',
              exerciseResults: []
            },
            { id: 'h07', userId: 'a7', courseId: '1', assignedAt: '2025-09-06T13:00:00Z', assignedBy: 'self-purchase',
              ...pay(25000, '2025-09-06T13:00:00Z', 'card', 268),
              progress: 100, lastActivity: '2025-10-14T11:00:00Z', status: 'archived',
              certified: true, grade: 13, certifiedAt: '2025-10-14T11:00:00Z', certificateId: 'AFL-2025-MKT-0268',
              exerciseResults: []
            },
            { id: 'h08', userId: 'a8', courseId: '2', assignedAt: '2025-09-21T16:40:00Z', assignedBy: 'self-purchase',
              ...pay(30000, '2025-09-21T16:40:00Z', 'stripe', 272),
              progress: 100, lastActivity: '2025-11-02T15:00:00Z', status: 'archived',
              certified: true, grade: 16, certifiedAt: '2025-11-02T15:00:00Z', certificateId: 'AFL-2025-EC-0272',
              exerciseResults: []
            },
            { id: 'h09', userId: 'a9', courseId: '2', assignedAt: '2025-10-03T10:00:00Z', assignedBy: 'self-purchase',
              ...pay(18000, '2025-10-03T10:00:00Z', 'wave', 284),
              migratedFrom: '6',
              progress: 22, lastActivity: '2025-10-18T09:00:00Z', status: 'archived',
              certified: false, grade: null, certifiedAt: null, certificateId: null,
              exerciseResults: []
            },
            { id: 'h10', userId: 'a10', courseId: '3', assignedAt: '2025-10-15T14:30:00Z', assignedBy: 'self-purchase',
              ...pay(35000, '2025-10-15T14:30:00Z', 'card', 289),
              progress: 100, lastActivity: '2025-12-01T11:00:00Z', status: 'archived',
              certified: true, grade: 19, certifiedAt: '2025-12-01T11:00:00Z', certificateId: 'AFL-2025-IA-0289',
              exerciseResults: []
            },
            { id: 'h11', userId: 'a11', courseId: '1', assignedAt: '2025-10-28T11:00:00Z', assignedBy: 'self-purchase',
              ...pay(25000, '2025-10-28T11:00:00Z', 'mobile_money', 296),
              progress: 100, lastActivity: '2025-11-30T10:00:00Z', status: 'archived',
              certified: true, grade: 15, certifiedAt: '2025-11-30T10:00:00Z', certificateId: 'AFL-2025-MKT-0296',
              exerciseResults: []
            },
            { id: 'h12', userId: 'a12', courseId: '5', assignedAt: '2025-11-09T09:30:00Z', assignedBy: 'self-purchase',
              ...pay(15000, '2025-11-09T09:30:00Z', 'orange_money', 301),
              progress: 100, lastActivity: '2025-12-02T16:00:00Z', status: 'archived',
              certified: true, grade: 14, certifiedAt: '2025-12-02T16:00:00Z', certificateId: 'AFL-2025-RS-0301',
              exerciseResults: []
            },
            { id: 'h13', userId: 'a13', courseId: '3', assignedAt: '2025-11-20T15:00:00Z', assignedBy: 'self-purchase',
              ...pay(22000, '2025-11-20T15:00:00Z', 'card', 312),
              migratedFrom: '7',
              progress: 67, lastActivity: '2025-12-22T14:00:00Z', status: 'archived',
              certified: false, grade: null, certifiedAt: null, certificateId: null,
              exerciseResults: []
            },
            { id: 'h14', userId: 'a14', courseId: '1', assignedAt: '2025-12-02T10:00:00Z', assignedBy: 'self-purchase',
              ...pay(18000, '2025-12-02T10:00:00Z', 'wave', 322),
              migratedFrom: '8',
              progress: 100, lastActivity: '2026-01-10T11:00:00Z', status: 'archived',
              certified: true, grade: 15, certifiedAt: '2026-01-10T11:00:00Z', certificateId: 'AFL-2026-MKT-0322',
              exerciseResults: []
            },
            // Remboursement : transaction de décembre créditée puis annulée en janvier
            { id: 'h15', userId: 'a15', courseId: '2', assignedAt: '2025-12-14T12:00:00Z', assignedBy: 'self-purchase',
              ...pay(30000, '2025-12-14T12:00:00Z', 'stripe', 331), paymentStatus: 'refunded', refundedAt: '2026-01-05T10:00:00Z',
              progress: 0, lastActivity: '2025-12-16T09:00:00Z', status: 'archived',
              certified: false, grade: null, certifiedAt: null, certificateId: null,
              exerciseResults: []
            },
            { id: 'h16', userId: 'a16', courseId: '3', assignedAt: '2026-01-07T11:00:00Z', assignedBy: 'self-purchase',
              ...pay(35000, '2026-01-07T11:00:00Z', 'card', 410),
              progress: 100, lastActivity: '2026-02-20T10:00:00Z', status: 'archived',
              certified: true, grade: 17, certifiedAt: '2026-02-20T10:00:00Z', certificateId: 'AFL-2026-IA-0410',
              exerciseResults: []
            },
            { id: 'h17', userId: 'a17', courseId: '1', assignedAt: '2026-01-22T14:00:00Z', assignedBy: 'self-purchase',
              ...pay(25000, '2026-01-22T14:00:00Z', 'mobile_money', 428),
              progress: 88, lastActivity: '2026-03-05T16:00:00Z', status: 'archived',
              certified: true, grade: 14, certifiedAt: '2026-03-05T16:00:00Z', certificateId: 'AFL-2026-MKT-0428',
              exerciseResults: []
            },
            { id: 'h18', userId: 'a18', courseId: '2', assignedAt: '2026-02-04T09:00:00Z', assignedBy: 'self-purchase',
              ...pay(18000, '2026-02-04T09:00:00Z', 'wave', 439),
              migratedFrom: '6',
              progress: 100, lastActivity: '2026-03-01T10:00:00Z', status: 'archived',
              certified: true, grade: 16, certifiedAt: '2026-03-01T10:00:00Z', certificateId: 'AFL-2026-EC-0439',
              exerciseResults: []
            },
            { id: 'h19', userId: 'a19', courseId: '2', assignedAt: '2026-02-18T15:30:00Z', assignedBy: 'self-purchase',
              ...pay(30000, '2026-02-18T15:30:00Z', 'card', 456),
              progress: 100, lastActivity: '2026-03-25T11:00:00Z', status: 'archived',
              certified: true, grade: 18, certifiedAt: '2026-03-25T11:00:00Z', certificateId: 'AFL-2026-EC-0456',
              exerciseResults: []
            },
            { id: 'h20', userId: 'a20', courseId: '5', assignedAt: '2026-03-09T10:00:00Z', assignedBy: 'self-purchase',
              ...pay(15000, '2026-03-09T10:00:00Z', 'orange_money', 478),
              progress: 55, lastActivity: '2026-04-02T09:00:00Z', status: 'archived',
              certified: false, grade: null, certifiedAt: null, certificateId: null,
              exerciseResults: []
            }
        ];

        // Pseudo-utilisateurs "alumni" pour les transactions historiques
        const alumniCountries = ['Sénégal', 'Côte d\'Ivoire', 'Mali', 'Ghana', 'Cameroun', 'Togo', 'Bénin', 'Burkina Faso', 'Gabon', 'Niger'];
        const alumniFirst = ['Aminata', 'Ibrahim', 'Mariam', 'Ousmane', 'Aissatou', 'Moussa', 'Khadija', 'Cheikh', 'Awa', 'Bakary', 'Rokia', 'Mamadou', 'Fatoumata', 'Abdoulaye', 'Awa', 'Seydou', 'Ramatoulaye', 'Issa', 'Binta', 'Modibo'];
        const alumniLast = ['Traoré', 'Diallo', 'Keita', 'Bamba', 'Sy', 'Touré', 'Fall', 'Camara', 'Sané', 'Koné', 'Diouf', 'Kouyaté', 'Gueye', 'Sarr', 'Ba', 'Thiam', 'Cissé', 'Barry', 'Kanté', 'Conté'];
        for (let i = 1; i <= 20; i++) {
            const fn = alumniFirst[i - 1];
            const ln = alumniLast[i - 1];
            seedUsers.push({
                id: 'a' + i,
                email: (fn + '.' + ln).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f']/g, '') + '@alumni.af',
                name: fn + ' ' + ln,
                phone: '',
                country: alumniCountries[i % alumniCountries.length],
                role: 'learner',
                createdAt: '2025-05-01T09:00:00Z',
                lastLogin: '2026-01-15T10:00:00Z',
                avatar: (fn[0] + ln[0]).toUpperCase()
            });
        }

        localStorage.setItem(STORAGE.users, JSON.stringify(seedUsers));
        localStorage.setItem(STORAGE.enrollments, JSON.stringify(seedEnrollments));
        localStorage.setItem(STORAGE.seeded, '1');
    }

    // Helpers IO ----------------------------------------------------
    const read = (key, fallback) => {
        try {
            const v = localStorage.getItem(key);
            return v ? JSON.parse(v) : fallback;
        } catch (e) { return fallback; }
    };
    const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
    const uid = (prefix) => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    // Public API ----------------------------------------------------
    const AdminData = {
        CATALOG,
        ADMIN_EMAILS,
        PAYMENT_METHODS,
        PAYMENT_STATUS,

        isAdminEmail(email) {
            return ADMIN_EMAILS.includes((email || '').toLowerCase().trim());
        },

        // Users
        getUsers() { return read(STORAGE.users, []); },
        getUser(id) { return this.getUsers().find(u => u.id === id); },
        getUserByEmail(email) {
            const e = (email || '').toLowerCase().trim();
            return this.getUsers().find(u => u.email.toLowerCase() === e);
        },
        createUser(data) {
            const users = this.getUsers();
            const email = (data.email || '').toLowerCase().trim();
            if (users.some(u => u.email.toLowerCase() === email)) {
                throw new Error('Un utilisateur avec cet email existe déjà');
            }
            const user = {
                id: uid('u'),
                email,
                name: data.name || email.split('@')[0],
                phone: data.phone || '',
                country: data.country || '',
                role: this.isAdminEmail(email) ? 'admin' : (data.role || 'learner'),
                createdAt: new Date().toISOString(),
                lastLogin: new Date().toISOString(),
                avatar: (data.name || email).substring(0, 2).toUpperCase()
            };
            users.push(user);
            write(STORAGE.users, users);
            return user;
        },
        updateUser(id, patch) {
            const users = this.getUsers();
            const i = users.findIndex(u => u.id === id);
            if (i < 0) return null;
            users[i] = Object.assign({}, users[i], patch);
            write(STORAGE.users, users);
            return users[i];
        },
        deleteUser(id) {
            write(STORAGE.users, this.getUsers().filter(u => u.id !== id));
            write(STORAGE.enrollments, this.getEnrollments().filter(e => e.userId !== id));
        },

        // Enrollments
        getEnrollments() { return read(STORAGE.enrollments, []); },
        getUserEnrollments(userId) {
            return this.getEnrollments().filter(e => e.userId === userId);
        },
        assignCourse(userId, courseId, assignedBy, note) {
            const enrollments = this.getEnrollments();
            if (enrollments.some(e => e.userId === userId && e.courseId === courseId)) {
                throw new Error('Cet apprenant a déjà accès à cette formation');
            }
            const e = {
                id: uid('e'),
                userId,
                courseId,
                assignedAt: new Date().toISOString(),
                assignedBy: assignedBy || 'admin',
                progress: 0,
                lastActivity: null,
                status: 'active',
                note: note || ''
            };
            enrollments.push(e);
            write(STORAGE.enrollments, enrollments);
            return e;
        },
        revokeCourse(userId, courseId) {
            write(STORAGE.enrollments,
                this.getEnrollments().filter(e => !(e.userId === userId && e.courseId === courseId)));
        },
        updateEnrollment(id, patch) {
            const enrollments = this.getEnrollments();
            const i = enrollments.findIndex(e => e.id === id);
            if (i < 0) return null;
            enrollments[i] = Object.assign({}, enrollments[i], patch);
            write(STORAGE.enrollments, enrollments);
            return enrollments[i];
        },
        getEnrollment(userId, courseId) {
            return this.getEnrollments().find(e => e.userId === userId && e.courseId === courseId);
        },
        getEnrollmentById(id) {
            return this.getEnrollments().find(e => e.id === id);
        },

        // Certifications
        certifyEnrollment(userId, courseId, grade) {
            const enrollments = this.getEnrollments();
            const i = enrollments.findIndex(e => e.userId === userId && e.courseId === courseId);
            if (i < 0) throw new Error('Inscription introuvable');
            const g = Math.max(0, Math.min(20, Number(grade)));
            if (!isFinite(g) || g < 10) {
                throw new Error('Note invalide : minimum 10/20 pour être certifié');
            }
            const year = new Date().getFullYear();
            const prefix = CERT_PREFIX[courseId] || 'AL';
            const rand = Math.floor(1000 + Math.random() * 9000);
            enrollments[i] = Object.assign({}, enrollments[i], {
                certified: true,
                grade: g,
                certifiedAt: new Date().toISOString(),
                certificateId: `AFL-${year}-${prefix}-${rand}`
            });
            write(STORAGE.enrollments, enrollments);
            return enrollments[i];
        },
        revokeCertification(userId, courseId) {
            const enrollments = this.getEnrollments();
            const i = enrollments.findIndex(e => e.userId === userId && e.courseId === courseId);
            if (i < 0) return null;
            enrollments[i] = Object.assign({}, enrollments[i], {
                certified: false,
                grade: null,
                certifiedAt: null,
                certificateId: null
            });
            write(STORAGE.enrollments, enrollments);
            return enrollments[i];
        },
        updateGrade(userId, courseId, grade) {
            const enrollments = this.getEnrollments();
            const i = enrollments.findIndex(e => e.userId === userId && e.courseId === courseId);
            if (i < 0) return null;
            const g = Math.max(0, Math.min(20, Number(grade)));
            enrollments[i] = Object.assign({}, enrollments[i], { grade: g });
            write(STORAGE.enrollments, enrollments);
            return enrollments[i];
        },

        // Catalog
        getCourse(id) { return CATALOG.find(c => c.id === id); },
        getCatalog() { return CATALOG.slice(); },

        // Session
        setSession(user) {
            const s = {
                userId: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                loginAt: new Date().toISOString()
            };
            write(STORAGE.session, s);
            this.updateUser(user.id, { lastLogin: s.loginAt });
            return s;
        },
        getSession() { return read(STORAGE.session, null); },
        clearSession() { localStorage.removeItem(STORAGE.session); },
        requireAdmin(redirect) {
            const s = this.getSession();
            if (!s || s.role !== 'admin') {
                if (redirect !== false) location.href = 'connexion.html';
                return false;
            }
            return s;
        },

        // Stats
        getStats() {
            const users = this.getUsers().filter(u => u.role !== 'admin');
            const enrollments = this.getEnrollments();
            const activeEnrollments = enrollments.filter(e => e.status === 'active');
            const totalRevenue = enrollments
                .filter(e => e.assignedBy === 'self-purchase')
                .reduce((sum, e) => {
                    const c = this.getCourse(e.courseId);
                    return sum + (c ? c.price : 0);
                }, 0);
            const avgProgress = activeEnrollments.length
                ? Math.round(activeEnrollments.reduce((s, e) => s + e.progress, 0) / activeEnrollments.length)
                : 0;
            const completed = enrollments.filter(e => e.progress >= 90).length;
            const atRisk = enrollments.filter(e => e.status === 'at_risk').length;
            const certified = enrollments.filter(e => e.certified).length;
            const totalExercises = enrollments.reduce((s, e) => s + (e.exerciseResults ? e.exerciseResults.length : 0), 0);
            return {
                totalLearners: users.length,
                totalEnrollments: enrollments.length,
                activeEnrollments: activeEnrollments.length,
                totalRevenue,
                avgProgress,
                completed,
                atRisk,
                certified,
                totalExercises,
                completionRate: enrollments.length ? Math.round((completed / enrollments.length) * 100) : 0
            };
        },

        // Sales / e-commerce ------------------------------------------
        // Retourne toutes les transactions (= inscriptions avec paiement)
        getTransactions() {
            return this.getEnrollments()
                .filter(e => e.assignedBy === 'self-purchase' && e.paidAt)
                .map(e => {
                    const user = this.getUser(e.userId);
                    const course = this.getCourse(e.courseId);
                    return {
                        id: e.id,
                        orderId: e.orderId || ('ORD-' + e.id),
                        userId: e.userId,
                        userName: user ? user.name : '—',
                        userEmail: user ? user.email : '',
                        country: user ? (user.country || '') : '',
                        courseId: e.courseId,
                        courseName: course ? course.name : '—',
                        amount: e.amount || (course ? course.price : 0),
                        paidAt: e.paidAt,
                        paymentMethod: e.paymentMethod || 'mobile_money',
                        paymentStatus: e.paymentStatus || 'paid',
                        refundedAt: e.refundedAt || null
                    };
                })
                .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt));
        },

        // KPIs globaux : CA total, CA du mois, panier moyen, nombre de commandes
        getSalesStats(now) {
            const ref = now ? new Date(now) : new Date();
            const txs = this.getTransactions();
            const paid = txs.filter(t => t.paymentStatus === 'paid');
            const refunded = txs.filter(t => t.paymentStatus === 'refunded');

            const totalRevenue = paid.reduce((s, t) => s + t.amount, 0);
            const refundedAmount = refunded.reduce((s, t) => s + t.amount, 0);
            const netRevenue = totalRevenue - refundedAmount;

            const startOfMonth = new Date(ref.getFullYear(), ref.getMonth(), 1);
            const startOfPrevMonth = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
            const endOfPrevMonth = startOfMonth;

            const thisMonth = paid.filter(t => new Date(t.paidAt) >= startOfMonth);
            const prevMonth = paid.filter(t => {
                const d = new Date(t.paidAt);
                return d >= startOfPrevMonth && d < endOfPrevMonth;
            });

            const thisMonthRevenue = thisMonth.reduce((s, t) => s + t.amount, 0);
            const prevMonthRevenue = prevMonth.reduce((s, t) => s + t.amount, 0);

            // Variation mois/mois en %
            let monthGrowth = 0;
            if (prevMonthRevenue > 0) {
                monthGrowth = Math.round(((thisMonthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100);
            } else if (thisMonthRevenue > 0) {
                monthGrowth = 100;
            }

            const avgBasket = paid.length ? Math.round(totalRevenue / paid.length) : 0;

            return {
                totalRevenue,
                netRevenue,
                refundedAmount,
                thisMonthRevenue,
                prevMonthRevenue,
                monthGrowth,
                orderCount: paid.length,
                refundCount: refunded.length,
                avgBasket,
                thisMonthOrders: thisMonth.length
            };
        },

        // CA mensuel sur les N derniers mois (inclut le mois en cours)
        getRevenueByMonth(n, now) {
            const months = Math.max(1, n || 12);
            const ref = now ? new Date(now) : new Date();
            const paid = this.getTransactions().filter(t => t.paymentStatus === 'paid');
            const series = [];
            for (let i = months - 1; i >= 0; i--) {
                const d = new Date(ref.getFullYear(), ref.getMonth() - i, 1);
                const next = new Date(ref.getFullYear(), ref.getMonth() - i + 1, 1);
                const monthTx = paid.filter(t => {
                    const td = new Date(t.paidAt);
                    return td >= d && td < next;
                });
                series.push({
                    year: d.getFullYear(),
                    month: d.getMonth() + 1,
                    label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
                    revenue: monthTx.reduce((s, t) => s + t.amount, 0),
                    orders: monthTx.length
                });
            }
            return series;
        },

        // Répartition par formation
        getRevenueByCourse() {
            const paid = this.getTransactions().filter(t => t.paymentStatus === 'paid');
            const total = paid.reduce((s, t) => s + t.amount, 0) || 1;
            const byId = {};
            paid.forEach(t => {
                if (!byId[t.courseId]) {
                    const c = this.getCourse(t.courseId);
                    byId[t.courseId] = { courseId: t.courseId, name: c ? c.name : '—', category: c ? c.category : '', sales: 0, revenue: 0, unitPrice: c ? c.price : 0 };
                }
                byId[t.courseId].sales += 1;
                byId[t.courseId].revenue += t.amount;
            });
            return Object.values(byId)
                .map(r => Object.assign(r, { share: Math.round((r.revenue / total) * 100) }))
                .sort((a, b) => b.revenue - a.revenue);
        },

        // Export CSV (RFC 4180) — renvoie la chaîne prête à télécharger
        exportTransactionsCSV() {
            const txs = this.getTransactions();
            const headers = ['Commande', 'Date', 'Apprenant', 'Email', 'Pays', 'Formation', 'Montant (FCFA)', 'Méthode', 'Statut'];
            const esc = (v) => {
                const s = String(v == null ? '' : v);
                return /[",;\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
            };
            const rows = txs.map(t => [
                t.orderId,
                new Date(t.paidAt).toISOString().slice(0, 10),
                t.userName,
                t.userEmail,
                t.country,
                t.courseName,
                t.amount,
                PAYMENT_METHODS[t.paymentMethod] || t.paymentMethod,
                (PAYMENT_STATUS[t.paymentStatus] && PAYMENT_STATUS[t.paymentStatus].label) || t.paymentStatus
            ].map(esc).join(','));
            return [headers.join(','), ...rows].join('\r\n');
        },

        // Marquer un remboursement (pour refund bouton)
        refundTransaction(enrollmentId) {
            const enrollments = this.getEnrollments();
            const i = enrollments.findIndex(e => e.id === enrollmentId);
            if (i < 0) throw new Error('Transaction introuvable');
            if (enrollments[i].paymentStatus === 'refunded') {
                throw new Error('Cette commande est déjà remboursée');
            }
            enrollments[i] = Object.assign({}, enrollments[i], {
                paymentStatus: 'refunded',
                refundedAt: new Date().toISOString()
            });
            write(STORAGE.enrollments, enrollments);
            return enrollments[i];
        },

        // Reset (utile en demo)
        resetDemo() {
            localStorage.removeItem(STORAGE.users);
            localStorage.removeItem(STORAGE.enrollments);
            localStorage.removeItem(STORAGE.session);
            localStorage.removeItem(STORAGE.seeded);
            seedIfNeeded();
        },

        _STORAGE: STORAGE
    };

    // Init au chargement du script
    seedIfNeeded();

    // Expose global
    window.AdminData = AdminData;
})();
