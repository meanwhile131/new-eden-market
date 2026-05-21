const compat_date = "2026-05-19";

/** @param {RequestInfo | URL} url
 * @param {RequestInit} params */
async function fetch_rated(url, params = undefined) {
	let resp;
	while (resp == undefined || resp.status == 429) {
		resp = await fetch(url, params);
		if (resp.status == 429) {
			const delay = resp.headers.get("Retry-After", 10);
			await Promise(resolve => setTimeout(resolve, delay));
		}
	}
	return resp;
}

/** @typedef Order
 * @property {number} duration
 * @property {boolean} is_buy_order
 * @property {string} issued
 * @property {number} location_id
 * @property {number} min_volume
 * @property {number} order_id
 * @property {number} price
 * @property {string} range
 * @property {number} system_id
 * @property {number} type_id
 * @property {number} volume_remain
 * @property {number} volume_total
 * */

/** @typedef ItemOrders
 * @property {Order?} buy
 * @property {Order?} sell
 */

/** @param {ItemOrders} orders */
function get_potential_profit(orders) {
	return (orders?.buy?.price - orders?.sell?.price) * Math.min(orders?.buy?.volume_remain, orders?.sell?.volume_remain);
}

/** @param {ItemOrders} orders */
function rank_item(orders) {
	const profit = get_potential_profit(orders);
	return profit;
}

/** @param {Order[]} page */
function process_orders_page(page) {
	page.forEach(order => {
		var best_order = best_orders.get(order.type_id);
		if (order.is_buy_order && (best_order?.buy == undefined || order.price > best_order.buy.price)) {
			if (best_order == undefined) {
				best_order = {};
			}
			best_order.buy = order;
		}
		if (!order.is_buy_order && (best_order?.sell == undefined || order.price < best_order.sell.price)) {
			if (best_order == undefined) {
				best_order = {};
			}
			best_order.sell = order;
		}
		best_orders.set(order.type_id, best_order);
	});

}

/** @type {Map<number, ItemOrders>} */
const best_orders = new Map();
/** @type {HTMLProgressElement} */
const progressBar = document.getElementById("update_progress");
/** @type {HTMLTableElement} */
const table = document.getElementById("profitable");
/** @type {HTMLInputElement} */
const tokenInput = document.getElementById("token");

/** @type {number[]} */
progressBar.style.display = 'block';
const regions = await (await fetch_rated(`https://esi.evetech.net/universe/regions?compatibility_date=${compat_date}`)).json();

/** @type {Map<number, number>} */
const region_page_counts = new Map();
progressBar.max = regions.length;
progressBar.value = 0;
for (const region_id of regions) {
	const resp = await fetch_rated(`https://esi.evetech.net/markets/${region_id}/orders?compatibility_date=${compat_date}`);
	/** @type {Order[]} */
	const orders_page = await resp.json();
	process_orders_page(orders_page);
	const region_pages = Number(resp.headers.get("X-Pages", 1));
	progressBar.value += 1;
	progressBar.max += region_pages - 1;
	region_page_counts.set(region_id, region_pages);
}

for (const region_id of regions) {
	let total_pages = region_page_counts.get(region_id);
	for (let page = 2; page <= total_pages; page++) {
		const params = new URLSearchParams();
		params.append("page", page);

		const resp = await fetch_rated(`https://esi.evetech.net/markets/${region_id}/orders?${params}&compatibility_date=${compat_date}`);
		total_pages = resp.headers.get("X-Pages", 1);
		if (page == 1) {
			progressBar.max += total_pages - 1;
		}
		progressBar.value += 1;
		/** @type {Order[]} */
		const orders_page = await resp.json();
		process_orders_page(orders_page);
	}
}
progressBar.style.display = 'none';


/** @param {RequestInfo | URL} url */
async function esi_post(url) {
	if (!tokenInput.value) {
		alert("Specify an auth token");
		return;
	}
	const resp = await fetch_rated(url, {method: "POST", headers: { "Authorization": `Bearer ${tokenInput.value}`}});
	if (!resp.ok) {
		alert(`${resp.status}\n${await resp.text()}`);
	}
}

/** @param {HTMLTableRowElement} row
 * @param {Order} order */
function insert_order_info(row, order) {
	const locationLink = document.createElement("a");
	locationLink.href = `#${order?.location_id}`;
	locationLink.addEventListener("click", async (e) => {
		esi_post(`https://esi.evetech.net/ui/autopilot/waypoint?clear_other_waypoints=true&add_to_beginning=true&destination_id=${order?.location_id}&compatibility_date=${compat_date}`);
		e.preventDefault();
	});
	locationLink.innerText = order?.location_id;
	row.insertCell().appendChild(locationLink);
	row.insertCell().innerText = order?.price.toLocaleString();
	row.insertCell().innerText = order?.range;
	row.insertCell().innerText = order?.volume_remain.toLocaleString();
}

function update_items_table() {
	const best_items = new Map([...best_orders.entries()].sort((a, b) => rank_item(b[1]) - rank_item(a[1])));

	for (const item of best_items) {
		if (!item[1].buy || !item[1].sell) continue;
		const row = table.insertRow();
		const idLink = document.createElement("a");
		idLink.href = `#${item[0]}`;
		idLink.addEventListener("click", async (e) => {
			esi_post(`https://esi.evetech.net/ui/openwindow/marketdetails?type_id=${item[0]}&compatibility_date=${compat_date}`);
			e.preventDefault();
		});
		idLink.innerText = item[0];
		row.insertCell().appendChild(idLink);
		insert_order_info(row, item[1]?.buy);
		insert_order_info(row, item[1]?.sell);
		row.insertCell().innerText = get_potential_profit(item[1]).toLocaleString();
	}
}
update_items_table();
