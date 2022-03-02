import rp from "request-promise";
import cheerio from "cheerio";
import express from "express";
import cors from "cors";
import Redis from "ioredis";
const app = express();

const cacheTimeoutSeconds = 3 * 60 * 60;
const cacheUpdateSeconds = 1 * 60 * 60;

type ReturnObjectType = Classroom[];

type Classroom = {
	classroom: string;
	hours: number[];
	location?: string;
};

const redisClient = new Redis(process.env.REDIS_URL);

app.use(cors());

const getTodayDate = () => {
	const date = new Date();

	return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
};

const compressTimetableArray = (timetable: number[]) => {
	const res: number[] = [];
	let status = 0;
	let counter = 0;

	for (const el of timetable) {
		if (el === status) {
			counter++;
		} else {
			res.push(counter);
			counter = 1;
			status = 1 - status;
		}
	}

	res.push(counter);

	return res;
}

const elaboratePolimiWebsite = async (address: string, date: string) => {
	const getUrl = () => {
		const dateArray = date.split("/");

		return (
			"https://www7.ceda.polimi.it/spazi/spazi/controller/OccupazioniGiornoEsatto.do" +
			`?csic=${address}` +
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

	const result: ReturnObjectType = [];

	const tableRows = $("table.BoxInfoCard table.scrollTable tr");

	let normRowsCounter = 0;
	let actAddress: string | undefined;

	//!!! very risky, if something goes wrong check HERE

	tableRows.each((index, row) => {
		if ($(row).children(".innerEdificio").length > 0) {
			actAddress = $(row)
				.children(".innerEdificio")
				.text()
				.trim()
				.split(" - ")[1];

			// normalRows contain a single class, if the address has not ben setted yet than the normal row contains nothing
		} else if (
			typeof actAddress != "undefined" &&
			$(row).hasClass("normalRow")
		) {
			const date = $(row).children('.data').text().trim(); // saved for debug purposes
			const where = $(row).children('.dove').text().trim(); // get the classroom name

			const timetable: number[] = []; // here we save 0 every free 15 minutes, otherwise 1, starting from 8:00 AM

			$(row).children().each((_, td) => {
				// ignore the first two cells, we already processed them
				if ($(td).hasClass('data') || $(td).hasClass('dove')) {
					return;
				}

				// free 15 minutes
				if ($(td).hasClass('empty') || $(td).hasClass('empty_prima')) {
					timetable.push(0);
				} else if ($(td).hasClass('slot') && typeof $(td).attr('colspan') != 'undefined') {
					const busyCells = parseInt($(td).attr('colspan') ?? '');

					// busy 15 minutes
					for (let i = 0; i < busyCells; i++) {
						timetable.push(1);
					}
				}
			});

			if (where.length > 0) {
				result.push({
					classroom: where,
					hours: compressTimetableArray(timetable),
					location: actAddress,
				});
			}

			// const classroom = $(row).children(".dove").text().trim();

			// const freeHours = [];

			// let hours = -0.75;
			// let free = true;

			// $(row)
			// 	.children()
			// 	.each((_, td) => {
			// 		if ($(td).hasClass("slot")) {
			// 			if (typeof $(td).attr("colspan") != "undefined") {
			// 				const colspan: number = parseInt($(td).attr("colspan") ?? "");

			// 				if (free) {
			// 					freeHours.push(hours);
			// 					hours = colspan / 4;
			// 				} else {
			// 					hours += colspan / 4;
			// 				}
			// 			} else {
			// 				throw "Colspan not found, wrong website format";
			// 			}

			// 			free = false;
			// 		} else {
			// 			if (free) {
			// 				hours += 0.25;
			// 			} else {
			// 				freeHours.push(hours);
			// 				hours = 0.25;
			// 			}

			// 			free = true;
			// 		}
			// 	});

			// freeHours.push(hours - 0.75);

			// if (classroom.length > 0) {
			// 	result.push({
			// 		classroom: classroom,
			// 		hours: freeHours,
			// 		location: actAddress,
			// 	});

			// 	normRowsCounter++;
			// }
		}
	});

	// result.forEach((val) => {
	// 	let freeHours = 0;

	// 	for (let i = 0; i < val.hours.length; i += 2) {
	// 		freeHours += val.hours[i];
	// 	}

	// 	val.freeHours = freeHours;
	// });

	// result.sort((a, b) => b.freeHours! - a.freeHours!);

	return result;
};

const redisKeyGenerator = (address: string, date: string) =>
	`${address}-${date}`;

app.get("/", async (req, res) => {
	const date = req.query.date?.toString() ?? getTodayDate();
	const address = req.query.address?.toString() ?? "MIA";
	const redisKey = redisKeyGenerator(address, date);

	if (await redisClient.exists(redisKey)) {
		res.type("json");
		res.send(await redisClient.get(redisKey));

		redisClient.ttl(redisKey, async (_, ttl) => {
			if (cacheTimeoutSeconds - ttl > cacheUpdateSeconds) {
				const result = await elaboratePolimiWebsite(address, date);

				redisClient.setex(
					redisKey,
					cacheTimeoutSeconds,
					JSON.stringify(result)
				);
			}
		});
	} else {
		const result = await elaboratePolimiWebsite(address, date);

		redisClient.setex(redisKey, cacheTimeoutSeconds, JSON.stringify(result));

		res.send(result);
	}
});

app.listen(process.env.PORT || 5000, () => {
	console.log(`Currently listening`);
});

console.log("hey");
