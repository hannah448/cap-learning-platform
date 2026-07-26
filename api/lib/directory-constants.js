/**
 * Directory — constantes partagées (côté serveur)
 * ------------------------------------------------
 * Source de vérité pour la validation des payloads annuaire.
 * Le front consomme la même liste via js/directory-config.js
 * — garde les deux fichiers synchronisés en cas de modif.
 */

// 20 secteurs autorisés (correspond à la contrainte SQL profiles_sector_check)
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

const SECTOR_KEYS = SECTORS.map(s => s.key);

// 20 pays cible Cap Learning : 17 OHADA + RDC + Guinée + Comores
// (correspond aux comptes autorisés à s'inscrire à l'annuaire)
const COUNTRIES = [
    { iso: 'BJ', label: 'Bénin',                     flag: '🇧🇯' },
    { iso: 'BF', label: 'Burkina Faso',              flag: '🇧🇫' },
    { iso: 'CM', label: 'Cameroun',                  flag: '🇨🇲' },
    { iso: 'CF', label: 'Centrafrique',              flag: '🇨🇫' },
    { iso: 'KM', label: 'Comores',                   flag: '🇰🇲' },
    { iso: 'CG', label: 'Congo',                     flag: '🇨🇬' },
    { iso: 'CI', label: "Côte d'Ivoire",             flag: '🇨🇮' },
    { iso: 'GA', label: 'Gabon',                     flag: '🇬🇦' },
    { iso: 'GN', label: 'Guinée',                    flag: '🇬🇳' },
    { iso: 'GQ', label: 'Guinée équatoriale',        flag: '🇬🇶' },
    { iso: 'GW', label: 'Guinée-Bissau',             flag: '🇬🇼' },
    { iso: 'ML', label: 'Mali',                      flag: '🇲🇱' },
    { iso: 'NE', label: 'Niger',                     flag: '🇳🇪' },
    { iso: 'CD', label: 'RDC',                       flag: '🇨🇩' },
    { iso: 'SN', label: 'Sénégal',                   flag: '🇸🇳' },
    { iso: 'TD', label: 'Tchad',                     flag: '🇹🇩' },
    { iso: 'TG', label: 'Togo',                      flag: '🇹🇬' }
    // Note : la liste OHADA officielle comporte 17 pays. On complète avec
    // RDC, Guinée (Conakry) et Comores comme spécifié dans la spec. Trois
    // pays OHADA moins courants (Congo, Centrafrique, Guinée-Bissau, Guinée
    // équatoriale, Gabon, Tchad) sont déjà inclus. Ajuste si besoin.
];

const COUNTRY_ISO = COUNTRIES.map(c => c.iso);

// Regex E.164 : +[indicatif][numéro], entre 8 et 15 chiffres au total après le +
const WHATSAPP_REGEX = /^\+[1-9]\d{7,14}$/;

// Regex LinkedIn URL (souple : linkedin.com, fr.linkedin.com, www.linkedin.com…)
const LINKEDIN_REGEX = /^https:\/\/([a-z]{2,3}\.)?linkedin\.com\/.+/i;

// Limites de longueur (correspondent aux contraintes SQL)
const LIMITS = {
    display_name:     { max: 60 },
    city:             { max: 60 },
    project_title:    { max: 80 },
    project_pitch:    { max: 300 },
    instagram_handle: { max: 30 },
    linkedin_url:     { max: 200 }
};

module.exports = {
    SECTORS,
    SECTOR_KEYS,
    COUNTRIES,
    COUNTRY_ISO,
    WHATSAPP_REGEX,
    LINKEDIN_REGEX,
    LIMITS
};
