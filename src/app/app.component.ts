import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { GeminiService, Plate } from './gemini.service';
import { GoogleauthService } from './googleauth.service';
import { USDA_KEY } from './secrets';

interface FdaNutrtionData {
  aggregations: {
    dataType: unknown
    nutrients: unknown
  }
  currentPage: number
  foodSearchCriteria: {
    dataType: string[]
    foodTypes: string[]
    generalSearchInput: string
    numberOfResultsPerPage: number
    pageNumber: number
    pageSize: number
    query: string
    requireAllWords: false
    sortBy: string
    sortOrder: 'asc'
  }
  foods: UsdaFoodEntry[]
}

interface UsdaFoodEntry {
    additionalDescriptions: string
    allHighlightFields: string
    commonNames: string
    dataType: string
    description: string
    fdcId: number
    finalFoodInputFoods: {
      foodDescription: string
      gramWeight: number
      id: number
      portionCode: string
      portionDescription: string
      rank: number
      srCode: number
      unit: string
      value: number
    }[]
    foodAttributeTypes: unknown[]
    foodAttributes: unknown[]
    foodCategory: string
    foodCategoryId: number
    foodCode: number
    foodMeasures: unknown[]
    foodNutrients: {
      foodNutrientId: number
      indentLevel: number
      nutrientId: number
      nutrientName: string
      nutrientNumber: string
      rank: number
      unitName: string
      value: number
    }[]
}

interface DataSource {
  dataStreamName: 'NutritionSource',
  type: 'raw',
  application: {
    detailsUrl: 'https://example.com',
    name: 'Food Fotos',
    version: '2024.03.12'
  },
  dataType: {
    name: 'com.google.nutrition',
  }
}

// https://developers.google.com/fit/datatypes/nutrition
enum Meal {
  UNKNOWN = 1,
  BREAKFAST = 2,
  LUNCH = 3,
  DINNER = 4,
  SNACK = 5,
}

type Nutrient = 'calories' | 'fat.total' | 'fat.saturated' | 'fat.unsaturated'
  | 'fat.polyunsaturated' | 'fat.monounsaturated' | 'fat.trans'
  | 'cholesterol' | 'sodium' | 'potassium' | 'carbs.total' | 'dietary_fiber'
  | 'sugar' | 'protein'

const NutrientFitToUsda: Record<Nutrient, string> = {
  'calories': 'Energy',
  'fat.total': 'Total lipid (fat)',
  'fat.saturated': 'Fatty acids, total saturated',
  'fat.polyunsaturated': 'Fatty acids, total polyunsaturated',
  'fat.monounsaturated': 'Fatty acids, total monounsaturated',
  'cholesterol': 'Cholesterol',
  'sodium': 'Sodium, Na',
  'potassium': 'Potassium, K',
  'carbs.total': 'Carbohydrate, by difference',
  'dietary_fiber': 'Fiber, total dietary',
  'sugar': 'Sugars, total including NLEA',
  'protein': 'Protein',
  // These don't appear in USDA response
  'fat.unsaturated': '',
  'fat.trans': ''
}

interface NutritionMapVal {
  key: Nutrient
  value: {
    fpVal: number
  }
}

export interface NutritionSource {
  minStartTimeNs: number
  maxEndTimeNs: number
  dataSourceId?: string
  point: {
    startTimeNanos: number
    endTimeNanos: number
    dataTypeName: 'com.google.nutrition',
    value: [{
      mapVal: NutritionMapVal[]
    }, {
      intVal: number
    }, {
      strVal: string
    }]
  }[]
}

enum State {
  GetImage = 1,
  GetUsda = 2,
  AdjustData = 3,
  Submit = 4,
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements AfterViewInit {
  @ViewChild('foodpicker') foodpicker?: ElementRef
  @ViewChild('nutritionlabel') nutritionlabel?: ElementRef
  @ViewChild('file') file?: ElementRef
  title = 'food-fotos';
  processing = false
  journalImage = ''
  journalCalories = 0
  journalTime = 1
  journalPlate?: Plate;
  journalUsda: FdaNutrtionData[] = []
  journalEntry?: NutritionSource
  adjustFoodIndex = 0
  adjustFoodQuery = ''
  adjustFoodSize = 0
  state = State.GetImage
  nutrientUnits: Record<Nutrient, string> = {
    "calories": "Cal",
    "cholesterol": "mg",
    "dietary_fiber": "g",
    "potassium": "mg",
    "protein": "g",
    "sodium": "mg",
    "sugar": "g",
    "carbs.total": "g",
    "fat.total": "g",
    "fat.saturated": "g",
    "fat.monounsaturated": "g",
    "fat.polyunsaturated": "g",
    "fat.trans": "g",
    "fat.unsaturated": "g",
  }

  constructor(
    private readonly gemini: GeminiService,
    private readonly gapi: GoogleauthService,
  ) {}

  ngAfterViewInit(): void {
    this.gapi.setupApi()
    this.gapi.setupGSI()
  }

  login() {
    this.gapi.signin()
  }

  get isLoggedIn() {
    return this.gapi.loggedIn
  }

  selectPhoto() {
    this.file!.nativeElement.click()
  }

  async classify(event: any) {
    this.processing = true
    this.state = State.GetUsda
    const reader = new FileReader();
    if (event.target.files && event.target.files[0]) {
      const file = event.target.files[0]
      const miniFile = await this.resizeImage(file)
      reader.onload = async (event: any) => {
        this.journalImage = event.target.result
        const base64Data = event.target.result.split(',')[1]; // Remove the "data:..." prefix
        const plate = await this.gemini.runFateClassifier(base64Data)
        this.journalPlate = plate
        const nutrients = await this.getAllNutrients(plate.map(p => p.foodKey))
        this.journalUsda = nutrients
        this.state = State.AdjustData
        this.processing = false
        this.journalTime = (() => {
          const h = new Date().getHours()
          if (h > 6 && h <= 11) return Meal.BREAKFAST
          if (h < 15) return Meal.LUNCH
          if (h >= 18 && h < 22) return Meal.DINNER
          return Meal.SNACK
        })()
        this.generatePayload(nutrients, plate, this.journalTime)
      }

      reader.readAsDataURL(miniFile)
    }
  }

  async resizeImage(file: File): Promise<Blob> {
    const image = new Image();
    const maxWidth = 800; // Adjust this value to your desired maximum width
    const maxHeight = 600; // Adjust this value to your desired maximum height
  
    return new Promise((resolve, reject) => {
      image.onload = () => {
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
  
        let newWidth, newHeight;
        if (image.width > image.height) {
          newWidth = maxWidth;
          newHeight = image.height / (image.width / newWidth);
        } else {
          newHeight = maxHeight;
          newWidth = image.width / (image.height / newHeight);
        }
  
        canvas.width = newWidth;
        canvas.height = newHeight;
        context!.drawImage(image, 0, 0, newWidth, newHeight);
  
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create resized image blob"));
          }
        }, 'image/jpeg', 0.8); // Adjust the quality (0-1) or format if needed
      };
  
      image.onerror = (err: any) => reject(new Error("Failed to load image:", err));
      image.src = URL.createObjectURL(file);
    });
  }

  async getAllNutrients(foods: string[]): Promise<FdaNutrtionData[]> {
    return Promise.all(foods.map(x => this.getNutrient(x)))
  }

  async getNutrient(food: string): Promise<FdaNutrtionData> {
    const endpoint = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(food)}&dataType=Survey%20%28FNDDS%29&pageSize=10&sortBy=dataType.keyword&sortOrder=asc&api_key=${USDA_KEY}`
    const res = await fetch(endpoint)
    const json = await res.json() as FdaNutrtionData
    console.debug(json)
    return json
  }

  convertUsdaToFit(foods: FdaNutrtionData[], plate: Plate, meal: Meal) {
    console.log(plate)
    const now = Date.now()
    const datum: NutritionSource = {
      minStartTimeNs: now * 1_000_000 - 1000,
      maxEndTimeNs: now * 1_000_000 + 1000,
      point: foods.map((food, i) => ({
        startTimeNanos: now * 1_000_000 - 100,
        endTimeNanos: now * 1_000_000 + 100,
        dataTypeName: 'com.google.nutrition',
        value: [{
          mapVal: [
            this.convertUsdaNutrientToFit(food, 'calories', plate[i].portionNum),
            this.convertUsdaNutrientToFit(food, 'fat.total', plate[i].portionNum),
            this.convertUsdaNutrientToFit(food, 'fat.saturated', plate[i].portionNum),
            this.convertUsdaNutrientToFit(food, 'fat.polyunsaturated', plate[i].portionNum),
            this.convertUsdaNutrientToFit(food, 'fat.monounsaturated', plate[i].portionNum),
            this.convertUsdaNutrientToFit(food, 'cholesterol', plate[i].portionNum),
            this.convertUsdaNutrientToFit(food, 'sodium', plate[i].portionNum),
            this.convertUsdaNutrientToFit(food, 'potassium', plate[i].portionNum),
            this.convertUsdaNutrientToFit(food, 'carbs.total', plate[i].portionNum),
            this.convertUsdaNutrientToFit(food, 'dietary_fiber', plate[i].portionNum),
            this.convertUsdaNutrientToFit(food, 'sugar', plate[i].portionNum),
            this.convertUsdaNutrientToFit(food, 'protein', plate[i].portionNum),
          ].filter(x => x) as NutritionMapVal[], // Defined only
        }, {
          intVal: meal,
        }, {
          strVal: `${food.foodSearchCriteria.query}, ${plate[i].portionNum} ${plate[i].portion}`,
        }]
      }))
    }
    console.debug(datum)
    return datum
  }

  convertUsdaNutrientToFit(food: FdaNutrtionData, string: Nutrient, portionSize: number): NutritionMapVal | null {
    const usdaKey = NutrientFitToUsda[string]
    const finder = food.foods[0].foodNutrients.find(n => n.nutrientName === usdaKey)
    if (!finder) return null
    return {
      key: string,
      value: {
        fpVal: finder?.value * portionSize
      }
    }
  }

  generatePayload(nutrients: FdaNutrtionData[], plate: Plate, meal: Meal) {
    this.journalEntry = this.convertUsdaToFit(nutrients, plate, Meal.LUNCH)
    this.journalCalories = (() => {
      let c = 0
      this.journalEntry!.point[0].value[0].mapVal.forEach(v => {
        if (v.key === 'calories') {
          c += v.value.fpVal
        }
      })
      return c
    })()
  }

  adjustFood(i: number) {
    this.adjustFoodSize = this.journalPlate![i].portionNum
    this.adjustFoodIndex = i
    this.adjustFoodQuery = this.journalPlate![i].foodKey
    this.foodpicker!.nativeElement.showModal()
  }

  updateAdjustFood(f: UsdaFoodEntry, swapIndex: number) {
    // Overwrite original food. This won't be perfect.
    this.journalUsda[this.adjustFoodIndex].foods[swapIndex] = this.journalUsda[this.adjustFoodIndex].foods[0]
    this.journalUsda[this.adjustFoodIndex].foods[0] = f
    this.journalPlate![this.adjustFoodIndex].portionNum = this.adjustFoodSize
    this.generatePayload(this.journalUsda, this.journalPlate!, this.journalTime)
  }

  updateAdjustFoodQuery() {
    window.requestAnimationFrame(async () => {
      console.log(this.adjustFoodQuery, this.adjustFoodSize, this.adjustFoodIndex)
      this.journalPlate![this.adjustFoodIndex].foodKey = this.adjustFoodQuery
      this.journalUsda[this.adjustFoodIndex].foods = []
      const res = await this.getNutrient(this.adjustFoodQuery)
      this.journalUsda[this.adjustFoodIndex] = res
      this.generatePayload(this.journalUsda, this.journalPlate!, this.journalTime)
    })
  }

  updateAdjustFoodSize() {
    this.journalPlate![this.adjustFoodIndex].portionNum = this.adjustFoodSize
    this.generatePayload(this.journalUsda, this.journalPlate!, this.journalTime)
  }

  dismiss() {
    this.foodpicker?.nativeElement.close()
    this.nutritionlabel?.nativeElement.close()
  }

  async hydrate() {
    if (!this.isLoggedIn) {
      return this.gapi.signin()
    }
    this.processing = true
    const {dataStreamId} = await this.gapi.generateFitJournalEntry('HydrationSource', 'com.google.hydration')
    await this.gapi.patchHydrationEntry(dataStreamId)
    this.processing = false
    alert('Checked in 1 cup of water!')
  }

  showAllNutrients() {
    this.nutritionlabel!.nativeElement!.showModal()
  }

  async addJournal() {
    this.processing = true
    const {dataStreamId} = await this.gapi.generateFitJournalEntry('NutritionSource', 'com.google.nutrition')
    console.log(`Got dataStreamId ${dataStreamId}`)
    await this.gapi.patchFitJournalEntry(dataStreamId, this.journalEntry!)
    // Clear
    this.journalEntry = undefined
    this.journalPlate = undefined
    this.journalImage = ''
    this.journalUsda = []
    this.processing = false
    this.state = State.GetImage
  }
}
