const $ = (s) => document.querySelector(s),
  money = (n) =>
    new Intl.NumberFormat("nl-BE", {
      style: "currency",
      currency: "EUR",
    }).format(n / 100);
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let checkoutAvailable = false;
let products = [],
  category = "Alles",
  cart = [];
try {
  cart = JSON.parse(localStorage.getItem("kitoko-cart") || "[]");
  if (!Array.isArray(cart)) cart = [];
} catch {}
const bottle = (p) =>
  p.image
    ? `<img class="product-image" src="${esc(p.image)}" alt="${esc(p.name)}">`
    : `<div class="bottle" style="--color:${/^#[0-9a-f]{6}$/i.test(p.color) ? p.color : "#eeeeee"}"><div class="cap"></div><div class="label"><small>LE ESSENZE DI VITA</small><strong>Kitoko</strong><i>by Essenza</i><hr><span>${esc(p.name)}</span><small>${esc(p.size)}</small></div></div>`;
function toast(s) {
  $("#toast").textContent = s;
  $("#toast").style.display = "block";
  setTimeout(() => ($("#toast").style.display = "none"), 2500);
}
function render() {
  const list = products.filter(
    (p) =>
      (category === "Alles" || p.category === category) &&
      `${p.name} ${p.description}`
        .toLowerCase()
        .includes($("#search").value.toLowerCase()),
  );
  $("#empty").hidden = !!list.length;
  $("#products").innerHTML = list
    .map(
      (p) =>
        `<article><button class="product-art" data-detail="${p.id}" aria-label="Bekijk ${esc(p.name)}"><span class="tag">${p.stock ? "VOORBEELD" : "UITVERKOCHT"}</span>${bottle(p)}</button><div class="product-meta"><div><h3>${esc(p.name)}</h3><p>${esc(p.category)} · ${esc(p.size)}</p></div><div class="price">${money(p.price)}</div></div><button class="add" data-add="${p.id}" ${p.stock ? "" : "disabled"}>Toevoegen aan winkelmand <span>＋</span></button></article>`,
    )
    .join("");
}
function save() {
  localStorage.setItem("kitoko-cart", JSON.stringify(cart));
  $("#count").textContent = cart.reduce((n, i) => n + i.quantity, 0);
}
function add(id) {
  const p = products.find((p) => p.id === id);
  let i = cart.find((i) => i.id === id);
  if (!p || (i?.quantity || 0) >= p.stock)
    return toast("Niet meer op voorraad");
  if (i) i.quantity++;
  else cart.push({ id, quantity: 1 });
  save();
  toast("Toegevoegd aan je winkelmand");
}
function renderCart() {
  cart = cart.filter((i) => products.some((p) => p.id === i.id));
  save();
  $("#cart-items").innerHTML =
    cart
      .map((i) => {
        const p = products.find((p) => p.id === i.id);
        return `<div class="cart-row"><div>${esc(p.name)}<br><small>${money(p.price)}</small></div><input type="number" min="1" max="${p.stock}" value="${i.quantity}" data-qty="${i.id}" aria-label="Aantal ${esc(p.name)}"><button data-remove="${i.id}" aria-label="Verwijder ${esc(p.name)}">×</button></div>`;
      })
      .join("") ||
    "<p>Je winkelmand is nog leeg. Ontdek jouw favoriete geur.</p>";
  $("#cart-total").textContent =
    "Totaal " +
    money(
      cart.reduce(
        (n, i) => n + products.find((p) => p.id === i.id).price * i.quantity,
        0,
      ),
    );
  $("#checkout").hidden = !cart.length || !checkoutAvailable;
}
document.addEventListener("click", (e) => {
  const addButton = e.target.closest("[data-add]");
  if (addButton) add(Number(addButton.dataset.add));
  const detail = e.target.closest("[data-detail]");
  if (detail) {
    const p = products.find((p) => p.id === Number(detail.dataset.detail));
    $("#product-detail").innerHTML =
      `<div class="product-art">${bottle(p)}</div><h2>${esc(p.name)}</h2><p>${esc(p.description)}</p><p>${esc(p.size)} · ${money(p.price)}</p><p class="muted">Voorbeeldproduct — nog niet de definitieve catalogus.</p><button class="button" data-add="${p.id}" ${p.stock ? "" : "disabled"}>In winkelmand</button>`;
    $("#product-dialog").showModal();
  }
  const close = e.target.closest("[data-close]");
  if (close) $("#" + close.dataset.close).close();
  const remove = e.target.closest("[data-remove]");
  if (remove) {
    cart = cart.filter((i) => i.id !== Number(remove.dataset.remove));
    renderCart();
  }
});
$("#cart-items").addEventListener("change", (e) => {
  if (e.target.dataset.qty) {
    const i = cart.find((i) => i.id === Number(e.target.dataset.qty)),
      p = products.find((p) => p.id === i.id);
    i.quantity = Math.min(
      p.stock,
      Math.max(1, Math.floor(Number(e.target.value) || 1)),
    );
    renderCart();
  }
});
$("#cart-open").onclick = () => {
  renderCart();
  $("#checkout-result").textContent = checkoutAvailable
    ? ""
    : "Dit is een demonstratie. Bestellen is nog niet beschikbaar.";
  $("#cart-dialog").showModal();
};
$("#search").oninput = render;
$("#checkout").onsubmit = async (e) => {
  e.preventDefault();
  const button = e.submitter;
  button.disabled = true;
  try {
    const r = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: Object.fromEntries(new FormData(e.target)),
        items: cart,
      }),
    });
    const data = await r.json();
    if (!r.ok) throw Error(data.error);
    cart = [];
    renderCart();
    $("#checkout-result").textContent =
      `Testbestelling ${data.id.slice(0, 8)} ontvangen. Er is geen betaling uitgevoerd. Afhaalplaats: ${e.target.pickup.value}.`;
    await load();
  } catch (e) {
    $("#checkout-result").textContent = e.message;
  } finally {
    button.disabled = false;
  }
};
async function load() {
  const configResponse = await fetch("/api/config");
  if (!configResponse.ok)
    throw Error("De winkelinstellingen kunnen niet geladen worden.");
  const config = await configResponse.json();
  checkoutAvailable = config.checkoutAvailable === true;
  if (!checkoutAvailable)
    $(".demo-banner").textContent =
      "Demonstratie — voorbeeldproducten en prijzen. Bestellen is nog niet beschikbaar.";
  const r = await fetch("/api/products");
  if (!r.ok) throw Error("De collectie kan niet geladen worden.");
  products = await r.json();
  $("#categories").innerHTML = [
    "Alles",
    ...new Set(products.map((p) => p.category)),
  ]
    .map(
      (c) =>
        `<button class="${c === category ? "selected" : ""}" data-category="${esc(c)}">${esc(c)}</button>`,
    )
    .join("");
  $("#categories").onclick = (e) => {
    if (e.target.dataset.category) {
      category = e.target.dataset.category;
      for (const b of $("#categories").children)
        b.classList.toggle("selected", b.dataset.category === category);
      render();
    }
  };
  render();
  save();
}
load().catch((e) => {
  $("#products").textContent = e.message;
});
