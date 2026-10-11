const $ = (s) => document.querySelector(s),
  esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    ),
  money = (n) =>
    new Intl.NumberFormat("nl-BE", {
      style: "currency",
      currency: "EUR",
    }).format(n / 100);
let products = [],
  orders = [];
function message(s, error = false) {
  $("#status").textContent = s;
  $("#status").classList.toggle("error", error);
}
async function api(path, data) {
  const r = await fetch(
    "/api/" + path,
    data
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        }
      : {},
  );
  const b = await r.json();
  if (!r.ok) {
    if (r.status === 401) {
      $("#dashboard").hidden = true;
      $("#login-panel").hidden = false;
    }
    throw Error(b.error);
  }
  return b;
}
async function load() {
  [products, orders] = await Promise.all([
    api("admin/products"),
    api("admin/orders"),
  ]);
  $("#login-panel").hidden = true;
  $("#dashboard").hidden = false;
  $("#product-list").innerHTML = products
    .map(
      (p) =>
        `<div class="admin-product"><div><b>${esc(p.name)}</b><br><small>${money(p.price)} · ${p.stock} op voorraad${p.stock < 5 ? " · Lage voorraad" : ""} · ${p.active ? "Zichtbaar" : "Verborgen"}</small></div><button data-edit="${p.id}">Bewerken</button></div>`,
    )
    .join("");
  renderOrders();
}
function renderOrders() {
  const q = $("#order-search").value.toLowerCase();
  $("#orders").innerHTML =
    orders
      .filter((o) =>
        `${o.id} ${o.customer.name} ${o.customer.email}`
          .toLowerCase()
          .includes(q),
      )
      .map(
        (o) =>
          `<form class="order" data-order="${o.id}"><b>#${o.id.slice(0, 8)} · ${money(o.total)}</b><p>${esc(o.customer.name)} · ${esc(o.customer.email)}<br>Afhalen: ${esc(o.customer.pickup)} · ${new Date(o.created).toLocaleString("nl-BE")}</p><p>${o.items.map((i) => `${i.quantity} × ${esc(i.name)}`).join("<br>")}</p><label for="payment-${o.id}">Betaling</label><select id="payment-${o.id}" name="payment">${options({ unpaid: "Niet betaald", paid: "Betaald", refunded: "Terugbetaald" }, o.payment)}</select><label for="shipping-${o.id}">Afhalen</label><select id="shipping-${o.id}" name="shipping">${options({ unfulfilled: "In behandeling", ready: "Klaar om af te halen", collected: "Afgehaald", cancelled: "Geannuleerd" }, o.shipping)}</select><button class="secondary">Status opslaan</button></form>`,
      )
      .join("") || "<p>Nog geen bestellingen gevonden.</p>";
}
function options(values, current) {
  return Object.entries(values)
    .map(
      ([v, l]) =>
        `<option value="${v}" ${v === current ? "selected" : ""}>${l}</option>`,
    )
    .join("");
}
$("#login").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api("login", Object.fromEntries(new FormData(e.target)));
    e.target.reset();
    await load();
    message("Ingelogd.");
  } catch (e) {
    message(e.message, true);
  }
};
$("#logout").onclick = async () => {
  await api("logout", {});
  $("#dashboard").hidden = true;
  $("#login-panel").hidden = false;
  message("Uitgelogd.");
};
$("#new").onclick = () => {
  $("#product-form").reset();
  $("#product-form").elements.id.value = "";
  $("#edit-title").textContent = "Nieuw product";
  $("#image-preview").hidden = true;
};
$("#product-list").onclick = (e) => {
  const b = e.target.closest("[data-edit]");
  if (!b) return;
  const p = products.find((p) => p.id === Number(b.dataset.edit));
  for (const [k, v] of Object.entries(p)) {
    const el = $("#product-form").elements[k];
    if (el) el.value = k === "price" ? (v / 100).toFixed(2) : v;
  }
  $("#edit-title").textContent = "Product bewerken";
  $("#image-preview").hidden = !p.image;
  $("#image-preview").src = p.image || "";
};
$("#product-form").onsubmit = async (e) => {
  e.preventDefault();
  const b = Object.fromEntries(new FormData(e.target));
  b.id = b.id ? Number(b.id) : undefined;
  b.price = Math.round(Number(b.price) * 100);
  b.stock = Number(b.stock);
  b.active = b.active === "1";
  try {
    await api("admin/products", b);
    await load();
    message("Product opgeslagen.");
  } catch (e) {
    message(e.message, true);
  }
};
$("#orders").onsubmit = async (e) => {
  e.preventDefault();
  try {
    await api("admin/orders", {
      ...Object.fromEntries(new FormData(e.target)),
      id: e.target.dataset.order,
    });
    await load();
    message("Bestelling bijgewerkt.");
  } catch (e) {
    message(e.message, true);
  }
};
$("#order-search").oninput = renderOrders;
load().catch(() => {});

$("#image-upload").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 2000000
  ) {
    message("Kies een PNG-, JPEG- of WebP-foto kleiner dan 2 MB.", true);
    e.target.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    $("#product-form").elements.image.value = reader.result;
    $("#image-preview").src = reader.result;
    $("#image-preview").hidden = false;
  };
  reader.readAsDataURL(file);
};
$("#image-remove").onclick = () => {
  $("#product-form").elements.image.value = "";
  $("#image-upload").value = "";
  $("#image-preview").hidden = true;
};
