// Inkompatible Erweiterung (4T-0298): darf wegen apiVersion 2.0 nie
// geladen werden — dieser Code würde beim Laden sofort auffallen.
export default {
  activate() {
    document.body.dataset.inkompatibelGeladen = 'true';
  },
};
