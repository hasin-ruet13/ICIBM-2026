#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { expandPresentationBlocks, fillMissingEndTimes, parseScheduleText, timeToMinutes } = require("../app.js");

const repoRoot = path.resolve(__dirname, "..");
const schedulePath = path.join(repoRoot, "icibm2026_program_schedule.txt");
const rawText = fs.readFileSync(schedulePath, "utf8");
const blocks = fillMissingEndTimes(expandPresentationBlocks(parseScheduleText(rawText)));

const failures = [];

function expect(description, condition) {
  if (!condition) failures.push(description);
}

function findBlock(fragment) {
  const needle = fragment.toLowerCase();
  return blocks.find((block) => block.searchText.includes(needle));
}

expect("all four conference days are present", new Set(blocks.map((block) => block.dayKey)).size === 4);
expect("all 249 normalized schedule entries are present", blocks.length === 249);
expect("every block has a positive duration", blocks.every((block) => timeToMinutes(block.endTime) > block.startMinutes));
expect("every block has a unique stable ID", new Set(blocks.map((block) => block.id)).size === blocks.length);
expect("no anonymous session cards remain", blocks.every((block) => block.title !== "ICIBM session block"));
expect("presentation annotations are expanded cleanly", blocks.every((block) => !block.title.startsWith("Presentation time:")));
expect("no malformed clock spacing remains", !/^\s*\d{1,2}\s+:|^\s*\d{1,2}:\s+\d|:\d{3}\s*(?:AM|PM)/im.test(rawText));
expect("no standalone dash time fragments remain", !/^\s*[–-]\s*$/m.test(rawText));
expect("ordinary session cards retain a room", blocks.filter((block) => block.kindLabel === "Session").every((block) => block.room));
expect(
  "Monday and Tuesday concurrent sessions no longer use Room 1220",
  !blocks.some(
    (block) => ["monday", "tuesday"].includes(block.dayKey) && block.room === "Room 1220" && block.kindLabel !== "Lunch",
  ),
);

const atlasTalk = findBlock("Atlas-based analysis");
expect("Sunday Atlas talk retains its time and room", atlasTalk?.startTime === "9:30 AM" && atlasTalk?.room === "Room 2220A&B");

const conceptTalk = findBlock("concept attribution");
expect("corrected Sunday 4:00 PM row is present", conceptTalk?.startTime === "4:00 PM" && conceptTalk?.room === "Room 2220A&B");

const hasinTalk = findBlock("CO-PICO/PECO");
expect("CO-PICO/PECO talk is present", Boolean(hasinTalk));
expect("CO-PICO/PECO talk is in Room 2220B", hasinTalk?.room === "Room 2220B");
expect("CO-PICO/PECO flash talk spans 4:00 PM–4:10 PM", hasinTalk?.startTime === "4:00 PM" && hasinTalk?.endTime === "4:10 PM");

const circaTalk = findBlock("CIRCA identifies cell-");
expect("CIRCA flash talk spans 4:10 PM–4:20 PM", circaTalk?.startTime === "4:10 PM" && circaTalk?.endTime === "4:20 PM");

const timedFlashTalks = blocks.filter(
  (block) => block.kindLabel === "Presentation" && timeToMinutes(block.endTime) - block.startMinutes === 10,
);
expect("all explicit 10-minute presentations were expanded", timedFlashTalks.length === 10);

const posterSession = findBlock("Poster Session (Atrium)");
expect("poster session is present", Boolean(posterSession));
expect("poster session spans 6:00 PM–7:30 PM", posterSession?.startTime === "6:00 PM" && posterSession?.endTime === "7:30 PM");
expect("poster session location is Atrium", posterSession?.room === "Atrium");

const wednesdayKeynote = findBlock("Digital Tissue Twins");
expect("Wednesday keynote starts at 8:30 AM", wednesdayKeynote?.startTime === "8:30 AM");
expect("Wednesday keynote ends at 9:10 AM", wednesdayKeynote?.endTime === "9:10 AM");

const awardCeremony = findBlock("Award Ceremony");
expect("award ceremony spans 9:10 AM–9:50 AM", awardCeremony?.startTime === "9:10 AM" && awardCeremony?.endTime === "9:50 AM");

const tuesdayClinicalTalk = findBlock("Agentic AI for complex clinical informatics workflows");
expect("Tuesday clinical informatics talk retains Room 2213B", tuesdayClinicalTalk?.room === "Room 2213B");

const kgPredictTalk = findBlock("KGPredict-Com");
expect("Wednesday KGPredict-Com talk retains its time and room", kgPredictTalk?.startTime === "9:50 AM" && kgPredictTalk?.room === "Room 2220A&B");

const closingRemarks = findBlock("Closing Remarks");
expect("closing remarks span 12:30 PM–12:40 PM", closingRemarks?.startTime === "12:30 PM" && closingRemarks?.endTime === "12:40 PM");

const loneTalk = findBlock("Single-Cell viral detection from unmapped");
expect("single occupied concurrent cell keeps Room 2220A", loneTalk?.room === "Room 2220A");

if (failures.length) {
  console.error(`Schedule validation failed (${failures.length}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const dayCounts = Object.fromEntries(
  ["sunday", "monday", "tuesday", "wednesday"].map((day) => [day, blocks.filter((block) => block.dayKey === day).length]),
);
console.log(`Validated ${blocks.length} schedule blocks.`);
console.log(`Day counts: ${JSON.stringify(dayCounts)}`);
