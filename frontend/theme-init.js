(() => {
  let theme='gallery';
  try{const stored=localStorage.getItem('grooveshelf-theme');if(['gallery','studio','listening'].includes(stored))theme=stored;}catch{}
  document.documentElement.dataset.theme=theme;
})();
