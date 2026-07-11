/**
 * Lightweight, dependency-free localization for the static labels that render
 * inside grant cards (Amount, Deadline, Agency, Track deadline, Show more, …).
 *
 * The card labels must follow the language the user wrote in — the same language
 * the agent's prose uses — so they don't sit in English next to localized text.
 * We detect the language from the user's message with a small keyword heuristic
 * and fall back to English. Supported: en, es, fr, de, pt, it.
 */

/**
 * @typedef {Object} GrantLabels
 * @property {string} amount
 * @property {string} deadline
 * @property {string} agency
 * @property {string} category
 * @property {string} trackDeadline
 * @property {string} viewOpportunity
 * @property {string} notListed
 * @property {string} via
 * @property {(n: number) => string} more  Localized "+N more" line.
 */

/** @type {Record<string, GrantLabels>} */
const LABELS = {
  en: {
    amount: 'Amount',
    deadline: 'Deadline',
    agency: 'Agency',
    category: 'Category',
    trackDeadline: 'Track deadline',
    viewOpportunity: 'View opportunity',
    notListed: 'Not listed',
    via: 'Live results from Grants.gov',
    more: (n) => `+${n} more — ask me to show the rest.`,
  },
  es: {
    amount: 'Monto',
    deadline: 'Fecha límite',
    agency: 'Agencia',
    category: 'Categoría',
    trackDeadline: 'Seguir plazo',
    viewOpportunity: 'Ver oportunidad',
    notListed: 'No indicado',
    via: 'Resultados en vivo de Grants.gov',
    more: (n) => `+${n} más — pídeme que muestre el resto.`,
  },
  fr: {
    amount: 'Montant',
    deadline: 'Échéance',
    agency: 'Agence',
    category: 'Catégorie',
    trackDeadline: 'Suivre l’échéance',
    viewOpportunity: 'Voir l’offre',
    notListed: 'Non indiqué',
    via: 'Résultats en direct de Grants.gov',
    more: (n) => `+${n} de plus — demandez-moi d’afficher le reste.`,
  },
  de: {
    amount: 'Betrag',
    deadline: 'Frist',
    agency: 'Behörde',
    category: 'Kategorie',
    trackDeadline: 'Frist verfolgen',
    viewOpportunity: 'Ausschreibung ansehen',
    notListed: 'Nicht angegeben',
    via: 'Live-Ergebnisse von Grants.gov',
    more: (n) => `+${n} weitere — bitte mich, den Rest zu zeigen.`,
  },
  pt: {
    amount: 'Valor',
    deadline: 'Prazo',
    agency: 'Agência',
    category: 'Categoria',
    trackDeadline: 'Acompanhar prazo',
    viewOpportunity: 'Ver oportunidade',
    notListed: 'Não informado',
    via: 'Resultados ao vivo do Grants.gov',
    more: (n) => `+${n} mais — peça para eu mostrar o restante.`,
  },
  it: {
    amount: 'Importo',
    deadline: 'Scadenza',
    agency: 'Agenzia',
    category: 'Categoria',
    trackDeadline: 'Segui scadenza',
    viewOpportunity: 'Vedi opportunità',
    notListed: 'Non indicato',
    via: 'Risultati dal vivo da Grants.gov',
    more: (n) => `+${n} altri — chiedimi di mostrare il resto.`,
  },
};

/** Distinctive words/diacritics per language, used to score a short message. */
const HINTS = {
  es: [/\b(subvenci[oó]n|subvenciones|ayuda|necesito|quiero|para|buscar|hola|gracias|fondos)\b/gi, /[ñ¿¡]/g],
  fr: [/\b(subventions?|pour|cherche|besoin|bonjour|merci|trouver|financement|je veux)\b/gi, /[çœ]/g],
  de: [/\b(zusch[üu]sse|f[öo]rderung|ich|brauche|suche|hallo|danke|finanzierung|f[üu]r)\b/gi, /[äöüß]/g],
  pt: [/\b(subven[çc][õo]es|preciso|quero|voc[êe]|ol[áa]|obrigad[oa]|financiamento|para)\b/gi, /[ãõ]/g],
  it: [
    /\b(sovvenzioni|cerco|bisogno|voglio|ciao|grazie|finanziamento|per favore)\b/gi,
    /\b(gli|della|sovvenzione)\b/gi,
  ],
};

/**
 * Detect the language of a short message. Returns a supported code, or 'en'.
 * @param {string} text
 * @returns {'en' | 'es' | 'fr' | 'de' | 'pt' | 'it'}
 */
export function detectLanguage(text) {
  const s = (text || '').toLowerCase();
  if (!s.trim()) return 'en';

  /** @type {[string, number][]} */
  const scores = Object.entries(HINTS).map(([lang, patterns]) => {
    let score = 0;
    for (const re of patterns) score += (s.match(re) || []).length;
    return [lang, score];
  });

  scores.sort((a, b) => b[1] - a[1]);
  const [best, bestScore] = scores[0];
  return /** @type {any} */ (bestScore > 0 ? best : 'en');
}

/**
 * Get the localized grant-card labels for a language code.
 * @param {string} [lang]
 * @returns {GrantLabels}
 */
export function grantLabels(lang) {
  return LABELS[lang || 'en'] || LABELS.en;
}
