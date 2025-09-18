import { createServiceClient } from '../src/lib/supabase'
import { v4 as uuidv4 } from 'uuid'

interface SeedData {
  menus: Array<{
    file_name: string
    file_type: string
    page_count: number
  }>
  extractedLines: Array<{
    menu_id: string
    page: number
    text: string
    bbox?: any
  }>
  labels: Array<{
    line_id: string
    label: 'approve' | 'deny' | 'edit'
    edited_text?: string
  }>
}

const seedData: SeedData = {
  menus: [
    {
      file_name: 'italian_restaurant_menu.pdf',
      file_type: 'application/pdf',
      page_count: 2
    },
    {
      file_name: 'french_bistro_menu.jpg',
      file_type: 'image/jpeg',
      page_count: 1
    },
    {
      file_name: 'american_steakhouse_menu.png',
      file_type: 'image/png',
      page_count: 1
    }
  ],
  extractedLines: [
    // Italian restaurant menu
    { menu_id: '', page: 1, text: 'ENTREES', bbox: { x: 100, y: 200, w: 200, h: 30 } },
    { menu_id: '', page: 1, text: 'Vitello alla Milanese', bbox: { x: 100, y: 250, w: 300, h: 25 } },
    { menu_id: '', page: 1, text: 'Breaded veal cutlet with lemon $24.50', bbox: { x: 100, y: 280, w: 400, h: 20 } },
    { menu_id: '', page: 1, text: 'Pollo al Limone', bbox: { x: 100, y: 320, w: 250, h: 25 } },
    { menu_id: '', page: 1, text: 'Lemon chicken with herbs $22.00', bbox: { x: 100, y: 350, w: 350, h: 20 } },
    { menu_id: '', page: 1, text: 'Pasta Carbonara', bbox: { x: 100, y: 390, w: 200, h: 25 } },
    { menu_id: '', page: 1, text: 'Creamy pasta with pancetta $18.50', bbox: { x: 100, y: 420, w: 380, h: 20 } },
    
    // French bistro menu
    { menu_id: '', page: 1, text: 'PLATS PRINCIPAUX', bbox: { x: 100, y: 200, w: 300, h: 30 } },
    { menu_id: '', page: 1, text: 'Coq au Vin', bbox: { x: 100, y: 250, w: 200, h: 25 } },
    { menu_id: '', page: 1, text: 'Traditional French chicken stew €28.00', bbox: { x: 100, y: 280, w: 400, h: 20 } },
    { menu_id: '', page: 1, text: 'Bouillabaisse', bbox: { x: 100, y: 320, w: 180, h: 25 } },
    { menu_id: '', page: 1, text: 'Provençal fish stew €32.50', bbox: { x: 100, y: 350, w: 350, h: 20 } },
    { menu_id: '', page: 1, text: 'Duck Confit', bbox: { x: 100, y: 390, w: 150, h: 25 } },
    { menu_id: '', page: 1, text: 'Slow-cooked duck leg €26.00', bbox: { x: 100, y: 420, w: 350, h: 20 } },
    
    // American steakhouse menu
    { menu_id: '', page: 1, text: 'MAIN COURSES', bbox: { x: 100, y: 200, w: 250, h: 30 } },
    { menu_id: '', page: 1, text: 'Ribeye Steak', bbox: { x: 100, y: 250, w: 200, h: 25 } },
    { menu_id: '', page: 1, text: '12oz ribeye with garlic butter $45.00', bbox: { x: 100, y: 280, w: 400, h: 20 } },
    { menu_id: '', page: 1, text: 'Lobster Tail', bbox: { x: 100, y: 320, w: 180, h: 25 } },
    { menu_id: '', page: 1, text: 'Maine lobster with drawn butter $38.00', bbox: { x: 100, y: 350, w: 400, h: 20 } },
    { menu_id: '', page: 1, text: 'Prime Rib', bbox: { x: 100, y: 390, w: 150, h: 25 } },
    { menu_id: '', page: 1, text: 'Slow-roasted prime rib $42.00', bbox: { x: 100, y: 420, w: 380, h: 20 } }
  ],
  labels: [
    // Italian restaurant labels
    { line_id: '', label: 'deny' }, // ENTREES (section header)
    { line_id: '', label: 'approve' }, // Vitello alla Milanese
    { line_id: '', label: 'deny' }, // description with price
    { line_id: '', label: 'approve' }, // Pollo al Limone
    { line_id: '', label: 'deny' }, // description with price
    { line_id: '', label: 'approve' }, // Pasta Carbonara
    { line_id: '', label: 'deny' }, // description with price
    
    // French bistro labels
    { line_id: '', label: 'deny' }, // PLATS PRINCIPAUX (section header)
    { line_id: '', label: 'approve' }, // Coq au Vin
    { line_id: '', label: 'deny' }, // description with price
    { line_id: '', label: 'approve' }, // Bouillabaisse
    { line_id: '', label: 'deny' }, // description with price
    { line_id: '', label: 'approve' }, // Duck Confit
    { line_id: '', label: 'deny' }, // description with price
    
    // American steakhouse labels
    { line_id: '', label: 'deny' }, // MAIN COURSES (section header)
    { line_id: '', label: 'approve' }, // Ribeye Steak
    { line_id: '', label: 'deny' }, // description with price
    { line_id: '', label: 'approve' }, // Lobster Tail
    { line_id: '', label: 'deny' }, // description with price
    { line_id: '', label: 'approve' }, // Prime Rib
    { line_id: '', label: 'deny' } // description with price
  ]
}

async function seedDatabase() {
  console.log('🌱 Starting database seeding...')
  
  const serviceClient = createServiceClient()
  
  try {
    // Clear existing data
    console.log('🧹 Clearing existing data...')
    await serviceClient.from('mlmp_labels').delete().neq('label_id', '00000000-0000-0000-0000-000000000000')
    await serviceClient.from('mlmp_predictions').delete().neq('pred_id', '00000000-0000-0000-0000-000000000000')
    await serviceClient.from('mlmp_extracted_lines').delete().neq('line_id', '00000000-0000-0000-0000-000000000000')
    await serviceClient.from('mlmp_menu_uploads').delete().neq('menu_id', '00000000-0000-0000-0000-000000000000')
    
    // Insert menus
    console.log('📄 Inserting menu uploads...')
    const { data: menuData, error: menuError } = await serviceClient
      .from('mlmp_menu_uploads')
      .insert(seedData.menus)
      .select()
    
    if (menuError) {
      throw new Error(`Failed to insert menus: ${menuError.message}`)
    }
    
    console.log(`✅ Inserted ${menuData?.length} menus`)
    
    // Update extracted lines with menu IDs
    const menuIds = menuData?.map(m => m.menu_id) || []
    const linesWithMenuIds = seedData.extractedLines.map((line, index) => ({
      ...line,
      menu_id: menuIds[Math.floor(index / 7)] // 7 lines per menu
    }))
    
    // Insert extracted lines
    console.log('📝 Inserting extracted lines...')
    const { data: lineData, error: lineError } = await serviceClient
      .from('mlmp_extracted_lines')
      .insert(linesWithMenuIds)
      .select()
    
    if (lineError) {
      throw new Error(`Failed to insert extracted lines: ${lineError.message}`)
    }
    
    console.log(`✅ Inserted ${lineData?.length} extracted lines`)
    
    // Update labels with line IDs
    const lineIds = lineData?.map(l => l.line_id) || []
    const labelsWithLineIds = seedData.labels.map((label, index) => ({
      ...label,
      line_id: lineIds[index]
    }))
    
    // Insert labels
    console.log('🏷️ Inserting labels...')
    const { data: labelData, error: labelError } = await serviceClient
      .from('mlmp_labels')
      .insert(labelsWithLineIds)
      .select()
    
    if (labelError) {
      throw new Error(`Failed to insert labels: ${labelError.message}`)
    }
    
    console.log(`✅ Inserted ${labelData?.length} labels`)
    
    // Insert sample predictions
    console.log('🤖 Inserting sample predictions...')
    const predictions = lineData?.map((line, index) => ({
      line_id: line.line_id,
      model_version: 'heuristic',
      features: {
        tokenCount: line.text.split(' ').length,
        hasDigits: /\d/.test(line.text) ? 1 : 0,
        hasCurrency: /[$€£¥]/.test(line.text) ? 1 : 0,
        isAllCaps: line.text === line.text.toUpperCase() ? 1 : 0,
        isTitleCase: line.text.split(' ').every(word => 
          word.length === 0 || (word[0] === word[0].toUpperCase() && word.slice(1) === word.slice(1).toLowerCase())
        ) ? 1 : 0,
        priceSameLine: /[$€£¥]\s?\d/.test(line.text) ? 1 : 0,
        priceNextLines1to3: 0,
        underEntreeHeader: /entree|main|plat|secondi/i.test(line.text) ? 1 : 0,
        punctDensity: (line.text.match(/[,;:]/g) || []).length / Math.max(line.text.length, 1),
        nextLineDescription: 0,
        prevLineHeader: 0,
        uppercaseRatio: (line.text.match(/[A-Z]/g) || []).length / Math.max((line.text.match(/[a-zA-Z]/g) || []).length, 1),
        lettersRatio: (line.text.match(/[a-zA-Z]/g) || []).length / Math.max(line.text.length, 1),
        avgTokenLen: line.text.split(' ').reduce((sum, word) => sum + word.length, 0) / Math.max(line.text.split(' ').length, 1),
        startsWithArticle: /^(a|an|the|le|la|les|un|une|il|lo|la|el|los|las)\s/i.test(line.text) ? 1 : 0,
        endsWithStop: /^(and|with|served|topped|garnished|fresh|local|organic)\s/i.test(line.text) ? 1 : 0
      },
      confidence: Math.random() * 0.8 + 0.1 // Random confidence between 0.1 and 0.9
    })) || []
    
    const { data: predictionData, error: predictionError } = await serviceClient
      .from('mlmp_predictions')
      .insert(predictions)
      .select()
    
    if (predictionError) {
      throw new Error(`Failed to insert predictions: ${predictionError.message}`)
    }
    
    console.log(`✅ Inserted ${predictionData?.length} predictions`)
    
    // Insert approved entrees
    console.log('🍽️ Inserting approved entrees...')
    const approvedLines = lineData?.filter((line, index) => 
      labelsWithLineIds[index]?.label === 'approve'
    ) || []
    
    const entrees = approvedLines.map(line => ({
      menu_id: line.menu_id,
      text: line.text,
      source_line_id: line.line_id
    }))
    
    const { data: entreeData, error: entreeError } = await serviceClient
      .from('mlmp_entrees')
      .insert(entrees)
      .select()
    
    if (entreeError) {
      throw new Error(`Failed to insert entrees: ${entreeError.message}`)
    }
    
    console.log(`✅ Inserted ${entreeData?.length} entrees`)
    
    console.log('🎉 Database seeding completed successfully!')
    console.log('\n📊 Summary:')
    console.log(`- ${menuData?.length} menu uploads`)
    console.log(`- ${lineData?.length} extracted lines`)
    console.log(`- ${labelData?.length} labels`)
    console.log(`- ${predictionData?.length} predictions`)
    console.log(`- ${entreeData?.length} approved entrees`)
    
  } catch (error) {
    console.error('❌ Seeding failed:', error)
    process.exit(1)
  }
}

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase()
}

export { seedDatabase }
