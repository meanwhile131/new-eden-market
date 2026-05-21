const compat_date = "2026-05-19";
async function fetch_rated(url) {
	let resp;
	while (resp == undefined || resp.status == 429) {
		resp = await fetch(url);
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
 * @property {Order} buy
 * @property {Order} sell
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

/** @type {Map<number, ItemOrders>} */
const best_orders = new Map();

/** @type {HTMLProgressElement} */
const progressBar = document.getElementById("update_progress");

/** @type {number[]} */
const regions = await (await fetch_rated(`https://esi.evetech.net/universe/regions?compatibility_date=${compat_date}`)).json();
progressBar.max = regions.length;
progressBar.value = 0;
progressBar.style.display = 'block';

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

for (const region_id of regions) {
	let total_pages = 1;
	for (let page = 1; page <= total_pages; page++) {
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

function update_items_table() {
	const best_items = new Map([...best_orders.entries()].sort((a, b) => rank_item(b[1]) - rank_item(a[1])));

	/** @type {HTMLTableElement} */
	const table = document.getElementById("profitable");
	for (const item of best_items) {
		const row = table.insertRow();
		row.insertCell().innerText = item[0];
		row.insertCell().innerText = item[1]?.buy?.location_id;
		row.insertCell().innerText = item[1]?.buy?.price.toLocaleString();
		row.insertCell().innerText = item[1]?.buy?.range;
		row.insertCell().innerText = item[1]?.sell?.location_id;
		row.insertCell().innerText = item[1]?.sell?.price.toLocaleString();
		row.insertCell().innerText = item[1]?.sell?.range;
		row.insertCell().innerText = get_potential_profit(item[1]).toLocaleString();
	}
}
update_items_table();
