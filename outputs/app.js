import { initAuth } from "./auth.js";
import { initBooking } from "./booking.js";
import { initProducts } from "./products.js";
import { initCalendar } from "./calendar.js";
import { initServices } from "./services.js";
import { initOrders } from "./orders.js";
import { initCash } from "./cash.js";

const banner = document.querySelector("#serviceList");
if (banner) {
  initAuth();
  initBooking();
  initProducts();
  initCalendar();
  initServices();
  initOrders();
  initCash();

  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-tab]").forEach((tab) => {
        const selected = tab === button;
        tab.classList.toggle("active", selected);
        tab.setAttribute("aria-selected", String(selected));
      });
      document.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.classList.toggle("hidden", panel.id !== button.dataset.tab);
      });
    });
  });
}
