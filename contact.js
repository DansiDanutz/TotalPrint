(function (root) {
  const contactAddress = 'contact@totalprint.ro';
  const maxMailtoLength = 1800;

  function buildContactMailto(details) {
    const subject = `Solicitare ofertă TotalPrint — ${details.eventType}`;
    const body = [
      `Nume: ${details.name}`,
      `Telefon: ${details.phone}`,
      `Email: ${details.email || 'Nu a fost furnizat'}`,
      `Tip eveniment: ${details.eventType}`,
      `Data evenimentului: ${details.eventDate || 'Nu a fost furnizată'}`,
      '',
      'Litere / mesaj dorit:',
      details.message,
    ].join('\n');

    const mailto = `mailto:${contactAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    if (mailto.length > maxMailtoLength) {
      throw new RangeError('Contact mailto payload is too long');
    }
    return mailto;
  }

  function initializeContactForm(documentRef, locationRef) {
    const form = documentRef.getElementById('contactForm');
    if (!form) return;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const details = Object.fromEntries(new FormData(form).entries());
      const status = documentRef.getElementById('contactStatus');

      try {
        const mailto = buildContactMailto(details);
        status.textContent = 'Se deschide aplicația ta de email. Trimite mesajul pregătit pentru a finaliza cererea.';
        locationRef.href = mailto;
      } catch (error) {
        if (!(error instanceof RangeError)) throw error;
        status.textContent = 'Mesajul este prea lung pentru aplicația de email. Scurtează detaliile și încearcă din nou.';
      }
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildContactMailto };
  } else {
    root.TotalPrintContact = { buildContactMailto, initializeContactForm };
  }
}(typeof window !== 'undefined' ? window : globalThis));
