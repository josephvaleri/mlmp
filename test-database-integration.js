// Test script to verify database integration
const { findEntreeMatch } = require('./src/lib/candidates/entreeLookup.ts')

async function testDatabaseIntegration() {
  console.log('Testing database integration...')
  
  // Test cases
  const testCases = [
    'Lobster Newburg',
    'New York Steak', 
    'Goat Cheese Won Tons',
    'Potato Skins',
    'Beef Ribs',
    'Crab and Scallop Cake',
    'Chicken Parmesan',
    'Caesar Salad',
    'Fish and Chips',
    'Margherita Pizza'
  ]
  
  for (const testCase of testCases) {
    try {
      console.log(`\nTesting: "${testCase}"`)
      const match = await findEntreeMatch(testCase)
      
      if (match) {
        console.log(`✅ MATCH FOUND:`)
        console.log(`   Name: ${match.name}`)
        console.log(`   Match Type: ${match.match_type}`)
        console.log(`   Confidence Boost: ${match.confidence_boost}`)
        console.log(`   Category: ${match.category || 'N/A'}`)
      } else {
        console.log(`❌ No match found`)
      }
    } catch (error) {
      console.error(`❌ Error testing "${testCase}":`, error.message)
    }
  }
  
  console.log('\nDatabase integration test completed!')
}

testDatabaseIntegration().catch(console.error)
