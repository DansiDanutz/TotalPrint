(function (root) {
  const contactAddress = 'contact@totalprint.ro';

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

    return `mailto:${contactAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function initializeContactForm(documentRef, locationRef) {
    const form = documentRef.getElementById('contactForm');
    if (!form) return;

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const details = Object.fromEntries(new FormData(form).entries());
      const status = documentRef.getElementById('contactStatus');

      status.textContent = 'Se deschide aplicația ta de email. Trimite mesajul pregătit pentru a finaliza cererea.';
      locationRef.href = buildContactMailto(details);
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { buildContactMailto };
  } else {
    root.TotalPrintContact = { buildContactMailto, initializeContactForm };
  }
}(typeof window !== 'undefined' ? window : globalThis));
