import assert from 'node:assert';
import { describe, it } from 'node:test';

import { detectLanguage, grantLabels } from '../../listeners/i18n.js';

describe('detectLanguage', () => {
  it('defaults to English for English or empty input', () => {
    assert.strictEqual(detectLanguage('find grants for youth programs'), 'en');
    assert.strictEqual(detectLanguage(''), 'en');
  });

  it('detects Spanish, French, German, Portuguese, and Italian', () => {
    assert.strictEqual(detectLanguage('necesito subvenciones para jóvenes'), 'es');
    assert.strictEqual(detectLanguage('je cherche des subventions pour les jeunes'), 'fr');
    assert.strictEqual(detectLanguage('ich brauche Zuschüsse für Jugendliche'), 'de');
    assert.strictEqual(detectLanguage('preciso de subvenções para você'), 'pt');
    assert.strictEqual(detectLanguage('cerco sovvenzioni, ho bisogno di aiuto'), 'it');
  });
});

describe('grantLabels', () => {
  it('returns localized labels, falling back to English', () => {
    assert.strictEqual(grantLabels('es').trackDeadline, 'Seguir plazo');
    assert.strictEqual(grantLabels('fr').amount, 'Montant');
    assert.strictEqual(grantLabels('en').deadline, 'Deadline');
    assert.strictEqual(grantLabels(undefined).agency, 'Agency');
    assert.strictEqual(grantLabels('xx').agency, 'Agency'); // unknown -> English
  });

  it('localizes the "+N more" line', () => {
    assert.ok(grantLabels('es').more(3).includes('3'));
    assert.ok(/más/.test(grantLabels('es').more(3)));
  });
});
