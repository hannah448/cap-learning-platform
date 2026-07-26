/* =============================================================================
   Cap Learning — Directory (frontend config)
   -----------------------------------------------------------------------------
   Source de vérité côté client pour l'annuaire des membres.
   Doit rester synchronisé avec api/lib/directory-constants.js (côté serveur).

   Exposé via window.CapDirectory (pattern déjà utilisé par window.CapConfig).
   ============================================================================= */

window.CapDirectory = (function () {

    // 20 secteurs autorisés
    const SECTORS = [
        { key: 'commerce',                    label: 'Commerce' },
        { key: 'mode-textile',                label: 'Mode & textile' },
        { key: 'alimentation',                label: 'Alimentation' },
        { key: 'beaute-cosmetique',           label: 'Beauté & cosmétique' },
        { key: 'sante-bien-etre',             label: 'Santé & bien-être' },
        { key: 'artisanat',                   label: 'Artisanat' },
        { key: 'agriculture-agroalimentaire', label: 'Agriculture & agroalimentaire' },
        { key: 'education-formation',         label: 'Éducation & formation' },
        { key: 'services-numeriques',         label: 'Services numériques' },
        { key: 'marketing-communication',     label: 'Marketing & communication' },
        { key: 'evenementiel',                label: 'Événementiel' },
        { key: 'tourisme-hospitality',        label: 'Tourisme & hospitality' },
        { key: 'btp-construction',            label: 'BTP & construction' },
        { key: 'transport-logistique',        label: 'Transport & logistique' },
        { key: 'finance-fintech',             label: 'Finance & fintech' },
        { key: 'immobilier',                  label: 'Immobilier' },
        { key: 'media-contenu',               label: 'Média & contenu' },
        { key: 'arts-culture',                label: 'Arts & culture' },
        { key: 'ong-social',                  label: 'ONG & social' },
        { key: 'autre',                       label: 'Autre' }
    ];

    // 17 OHADA + RDC + Guinée + Comores
    const COUNTRIES = [
        { iso: 'BJ', label: 'Bénin',              flag: '🇧🇯' },
        { iso: 'BF', label: 'Burkina Faso',       flag: '🇧🇫' },
        { iso: 'CM', label: 'Cameroun',           flag: '🇨🇲' },
        { iso: 'CF', label: 'Centrafrique',       flag: '🇨🇫' },
        { iso: 'KM', label: 'Comores',            flag: '🇰🇲' },
        { iso: 'CG', label: 'Congo',              flag: '🇨🇬' },
        { iso: 'CI', label: "Côte d'Ivoire",      flag: '🇨🇮' },
        { iso: 'GA', label: 'Gabon',              flag: '🇬🇦' },
        { iso: 'GN', label: 'Guinée',             flag: '🇬🇳' },
        { iso: 'GQ', label: 'Guinée équatoriale', flag: '🇬🇶' },
        { iso: 'GW', label: 'Guinée-Bissau',      flag: '🇬🇼' },
        { iso: 'ML', label: 'Mali',               flag: '🇲🇱' },
        { iso: 'NE', label: 'Niger',              flag: '🇳🇪' },
        { iso: 'CD', label: 'RDC',                flag: '🇨🇩' },
        { iso: 'SN', label: 'Sénégal',            flag: '🇸🇳' },
        { iso: 'TD', label: 'Tchad',              flag: '🇹🇩' },
        { iso: 'TG', label: 'Togo',               flag: '🇹🇬' }
    ];

    const WHATSAPP_REGEX = /^\+[1-9]\d{7,14}$/;
    const LINKEDIN_REGEX = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/.+/i;

    const LIMITS = {
        display_name:     { max: 60 },
        city:             { max: 60 },
        project_title:    { max: 80 },
        project_pitch:    { max: 300 },
        instagram_handle: { max: 30 },
        linkedin_url:     { max: 200 }
    };

    // Petits helpers pratiques pour les selects et les cartes
    function getSectorLabel(key) {
        const s = SECTORS.find(s => s.key === key);
        return s ? s.label : key;
    }

    function getCountry(iso) {
        return COUNTRIES.find(c => c.iso === iso) || null;
    }

    function getCountryLabel(iso) {
        const c = getCountry(iso);
        return c ? `${c.flag} ${c.label}` : iso;
    }

    return {
        SECTORS,
        COUNTRIES,
        WHATSAPP_REGEX,
        LINKEDIN_REGEX,
        LIMITS,
        getSectorLabel,
        getCountry,
        getCountryLabel
    };
})();
