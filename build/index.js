"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const request_promise_1 = __importDefault(require("request-promise"));
const cheerio_1 = __importDefault(require("cheerio"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const app = express_1.default();
app.use(cors_1.default());
const getTodayDate = () => {
    const date = new Date();
    return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
};
app.get("/", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const dateString = (_b = (_a = req.query.date) === null || _a === void 0 ? void 0 : _a.toString()) !== null && _b !== void 0 ? _b : getTodayDate();
    const addressString = (_c = req.query.address) !== null && _c !== void 0 ? _c : "MIA";
    const getUrl = () => {
        const dateArray = dateString.split("/");
        return ("https://www7.ceda.polimi.it/spazi/spazi/controller/OccupazioniGiornoEsatto.do" +
            `?csic=${addressString}` +
            "&categoria=tutte" +
            "&tipologia=tutte" +
            `&giorno_day=${dateArray[0]}` +
            `&giorno_month=${dateArray[1]}` +
            `&giorno_year=${dateArray[2]}` +
            "&jaf_giorno_date_format=dd%2FMM%2Fyyyy" +
            "&evn_visualizza=");
    };
    const url = getUrl();
    console.log(url);
    const html = yield request_promise_1.default(url);
    const $ = cheerio_1.default.load(html);
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
                var _a;
                if ($(td).hasClass("slot")) {
                    if (typeof $(td).attr("colspan") != "undefined") {
                        const colspan = parseInt((_a = $(td).attr("colspan")) !== null && _a !== void 0 ? _a : "");
                        if (free) {
                            freeHours.push(hours);
                            hours = colspan / 4;
                        }
                        else {
                            hours += colspan / 4;
                        }
                    }
                    else {
                        throw "Colspan not found, wrong website format";
                    }
                    free = false;
                }
                else {
                    if (free) {
                        hours += 0.25;
                    }
                    else {
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
}));
app.listen(process.env.PORT || 5000, () => {
    console.log(`Currently listening`);
});
console.log("hey");