import { config } from '../config/index.js';
import { GoogleGenerativeAI } from "@google/generative-ai";

async function main() {
  console.log("Config KEY:", config.GEMINI_API_KEY ? "EXISTS" : "MISSING");
  const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY!);
  try {
    const models = await genAI.getGenerativeModel({model: 'gemini-2.5-flash'}).generateContent("hi");
    console.log("gemini-2.5-flash works");
  } catch (e: any) {
    console.error("gemini-2.5-flash fail:", e.message);
  }
  try {
    const models = await genAI.getGenerativeModel({model: 'gemini-2.0-flash'}).generateContent("hi");
    console.log("gemini-2.0-flash works");
  } catch (e: any) {
    console.error("gemini-2.0-flash fail:", e.message);
  }
  try {
    const models = await genAI.getGenerativeModel({model: 'gemini-1.5-flash'}).generateContent("hi");
    console.log("gemini-1.5-flash works");
  } catch (e: any) {
    console.error("gemini-1.5-flash fail:", e.message);
  }
}
main();
