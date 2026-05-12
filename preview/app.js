const titles = {
  dashboard: "Dashboard executivo",
  escala: "Escala operacional",
  plantao: "Painel do plantonista",
  trocas: "Trocas e WhatsApp",
  ocorrencias: "Ocorrências",
  seguranca: "Segurança e acesso",
};

const buttons = document.querySelectorAll(".nav-item");
const views = document.querySelectorAll(".view");
const title = document.querySelector("#view-title");

buttons.forEach((button) => {
  button.addEventListener("click", () => {
    const target = button.dataset.view;
    buttons.forEach((item) => item.classList.toggle("active", item === button));
    views.forEach((view) => view.classList.toggle("active", view.id === target));
    title.textContent = titles[target] || "Exclusiva Turismo";
  });
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  });
}
