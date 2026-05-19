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
 * @type {object}
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

/** @type {Map<number, {
 * buy: Order,
 * sell: Order
 * }} */
const best_orders = new Map();

/** @type {number[]} */
const regions = await (await fetch_rated("https://esi.evetech.net/universe/regions")).json();
for (const region_id of regions) {
	let total_pages = 1;
	for (let page = 1; page <= total_pages; page++) {
		const params = new URLSearchParams();
		params.append("page", page);

		const resp = await fetch_rated(`https://esi.evetech.net/markets/${region_id}/orders?${params}`);
		total_pages = resp.headers.get("X-Pages", 1);
		/** @type {Order[]} */
		const orders_page = await resp.json();
		orders_page.forEach(order => {
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
			console.log(order.type_id, best_order);
		});
	}
}
console.log(best_orders);
