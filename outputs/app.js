import { initAuth } from "./auth.js";
import { initBooking } from "./booking.js";
import { initProducts } from "./products.js";
import { initCalendar } from "./calendar.js";

const banner = document.querySelector("#serviceList");
if (banner) {
  initAuth();
  initBooking();
  initProducts();
  initCalendar();
}
