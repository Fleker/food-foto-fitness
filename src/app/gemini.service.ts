import { Injectable } from '@angular/core';
import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  GenerativeModel,
  Part,
} from "@google/generative-ai";
import { GEMINI_KEY } from './secrets';

const MODEL_NAME = "gemini-1.0-pro-vision-latest";

const generationConfig = {
  temperature: 0.4,
  topK: 32,
  topP: 1,
  maxOutputTokens: 4096,
};

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

export type Plate = {
  foodKey: string
  portion: string
  portionNum: number
}[]

@Injectable({
  providedIn: 'root'
})
export class GeminiService {
  genAI: GoogleGenerativeAI
  model: GenerativeModel

  constructor() {
    this.genAI = new GoogleGenerativeAI(GEMINI_KEY);
    this.model = this.genAI.getGenerativeModel({ model: MODEL_NAME });
  }

  async runClassifier(image: string): Promise<Plate> {
    const parts: Part[] = [
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: image
        }
      },
      {text: " identify each food item in this photo and its portion size in a bulleted list with item and size separated by a comma\n\nfor example, if this was a picture of a hot dog, you'd return something like:\n- hot dog, 1, bun\n- french fries, 8, ounces\n- salad, 2, cups\n- pickled radishes, 3, pieces\n\nnow you try:"},
    ]
    const result = await this.model.generateContent({
      contents: [{ role: "user", parts }],
      generationConfig,
      safetySettings,
    })
    const response = result.response
    const results = response.text().trim()
    console.debug(results)
    const rows = results.split('-')
    return rows.map((row) => {
      const cols = row.split(',')
      if (cols.length > 3 || cols.length < 2) return undefined
      return {
        foodKey: cols[0].trim(),
        portion: (cols[2] ?? '').trim(),
        portionNum: parseInt(cols[1].trim())
      }
    }).filter(x => x) as Plate
  }

  async runFateClassifier(image: string): Promise<Plate> {
    return new Promise((res) => {
      setTimeout(() => {
        res([{
          foodKey: 'korean chicken wings',
          portion: 'pieces',
          portionNum: 10
        }, {
          foodKey: 'corn salad',
          portion: 'cup',
          portionNum: 1,
        }])
      }, 1000)
    })
  }
}
