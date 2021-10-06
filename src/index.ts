import rp from "request-promise";
import cheerio from "cheerio";
import express from "express";
import cors from "cors";
const app = express();

app.use(cors());

const getTodayDate = () => {
	const date = new Date();

	return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
};

app.get("/", async (req, res) => {
	const dateString = req.query.date?.toString() ?? getTodayDate();
	const addressString = req.query.address ?? "MIA";

	const getUrl = () => {
		const dateArray = dateString.split("/");

		return (
			"https://www7.ceda.polimi.it/spazi/spazi/controller/OccupazioniGiornoEsatto.do" +
			`?csic=${addressString}` +
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

	const result: {
		classroom: string;
		hours: number[];
		freeHours?: number;
	}[] = [];

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
						if (typeof $(td).attr("colspan") != "undefined") {
							const colspan: number = parseInt($(td).attr("colspan") ?? "");

							if (free) {
								freeHours.push(hours);
								hours = colspan / 4;
							} else {
								hours += colspan / 4;
							}
						} else {
							throw "Colspan not found, wrong website format";
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

	result.sort((a, b) => b.freeHours! - a.freeHours!);

	res.json(result);
});

app.listen(process.env.PORT || 5000, () => {
	console.log(`Currently listening`);
});

console.log("hey");