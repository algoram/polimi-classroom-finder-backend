const rp = require("request-promise");
const cheerio = require("cheerio");
const express = require("express");
const app = express();

const getTodayDate = () => {
	const date = new Date();

	return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
};

app.get("/", async (req, res) => {
	const date = req.query.date ?? getTodayDate();

	const getUrl = () => {
		const dateArray = date.split("/");

		return (
			"https://www7.ceda.polimi.it/spazi/spazi/controller/OccupazioniGiornoEsatto.do" +
			"?csic=MIA" +
			"&categoria=tutte" +
			"&tipologia=tutte" +
			`&giorno_day=${dateArray[0]}` +
			`&giorno_month=${dateArray[1]}` +
			`&giorno_year=${dateArray[2]}` +
			"&jaf_giorno_date_format=dd%2FMM%2Fyyyy" +
			"&evn_visualizza="
		);
	};

	const url = getUrl();

	console.log(url);

	const html = await rp(url);
	const $ = cheerio.load(html);

	const rows = $("tr.normalRow");

	const result = [];

	rows.each((i, tr) => {
		if (i != 0 && i != 1) {
			const classroom = $(tr).children(".dove").text().trim();

			const freeHours = [];

			let hours = -0.75;
			let free = true;

			$(tr)
				.children()
				.each((j, td) => {
					if ($(td).hasClass("slot")) {
						if (free) {
							freeHours.push(hours);
							hours = $(td).attr("colspan") / 4;
						} else {
							hours += $(td).attr("colspan") / 4;
						}

						free = false;
					} else {
						if (free) {
							hours += 0.25;
						} else {
							freeHours.push(hours);
							hours = 0.25;
						}

						free = true;
					}
				});

			freeHours.push(hours - 0.75);

			if (classroom.length > 0) {
				result.push({
					classroom: classroom,
					hours: freeHours,
				});
			}
		}
	});

	result.forEach((val) => {
		let freeHours = 0;

		for (let i = 0; i < val.hours.length; i += 2) {
			freeHours += val.hours[i];
		}

		val.freeHours = freeHours;
	});

	result.sort((a, b) => b.freeHours - a.freeHours);

	res.json(result);
});

app.listen(process.env.PORT || 3000, () => {
	console.log(`Currently listening`);
});
