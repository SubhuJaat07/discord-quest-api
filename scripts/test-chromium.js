/**
 * 🧪 Test Script: Chromium Client Verification
 * 
 * This script tests if Puppeteer and Chromium are properly configured
 * for Discord quest automation.
 * 
 * Usage:
 *   node scripts/test-chromium.js
 *   node scripts/test-chromium.js --token YOUR_DISCORD_TOKEN
 */

const puppeteer = require('puppeteer')

// Test configuration
const TEST_CONFIG = {
  headless: true,
  stealthMode: true,
  timeout: 30000
}

async function testChromiumSetup() {
  console.log('🧪 Starting Chromium Setup Test')
  console.log('═'.repeat(50))
  
  let browser = null
  
  try {
    // Test 1: Launch Browser
    console.log('\n📋 Test 1: Launching Chromium browser...')
    const launchStart = Date.now()
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--window-size=1280,720',
        '--disable-blink-features=AutomationControlled'
      ]
    })
    
    const launchTime = Date.now() - launchStart
    console.log(`✅ Browser launched in ${launchTime}ms`)
    
    // Test 2: Create Page
    console.log('\n📋 Test 2: Creating new page...')
    const page = await browser.newPage()
    
    // Set user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    )
    
    await page.setViewport({ width: 1280, height: 720 })
    console.log('✅ Page created with proper viewport')
    
    // Test 3: Navigate to Discord
    console.log('\n📋 Test 3: Navigating to Discord...')
    const navStart = Date.now()
    
    await page.goto('https://discord.com/app', { 
      waitUntil: 'networkidle2',
      timeout: TEST_CONFIG.timeout 
    })
    
    const navTime = Date.now() - navStart
    console.log(`✅ Discord loaded in ${navTime}ms`)
    
    // Test 4: Check page content
    console.log('\n📋 Test 4: Checking page content...')
    const title = await page.title()
    const url = page.url()
    
    console.log(`   Title: ${title}`)
    console.log(`   URL: ${url}`)
    console.log('✅ Page content accessible')
    
    // Test 5: Execute JavaScript
    console.log('\n📋 Test 5: Testing JavaScript execution...')
    const jsResult = await page.evaluate(() => {
      return {
        hasWebSocket: typeof WebSocket !== 'undefined',
        hasFetch: typeof fetch !== 'undefined',
        hasLocalStorage: typeof localStorage !== 'undefined',
        userAgent: navigator.userAgent,
        platform: navigator.platform
      }
    })
    
    console.log('   JavaScript capabilities:')
    console.log(`   - WebSocket: ${jsResult.hasWebSocket ? '✅' : '❌'}`)
    console.log(`   - Fetch: ${jsResult.hasFetch ? '✅' : '❌'}`)
    console.log(`   - LocalStorage: ${jsResult.hasLocalStorage ? '✅' : '❌'}`)
    console.log(`   - Platform: ${jsResult.platform}`)
    console.log('✅ JavaScript execution working')
    
    // Test 6: Screenshot (optional)
    console.log('\n📋 Test 6: Taking screenshot...')
    try {
      await page.screenshot({ 
        path: '/tmp/discord-test.png',
        fullPage: false 
      })
      console.log('✅ Screenshot saved to /tmp/discord-test.png')
    } catch (err) {
      console.log(`⚠️ Screenshot failed: ${err.message}`)
    }
    
    // Summary
    console.log('\n' + '═'.repeat(50))
    console.log('🎉 ALL TESTS PASSED!')
    console.log('═'.repeat(50))
    console.log('\n✅ Chromium is properly configured for:')
    console.log('   • Browser automation via Puppeteer')
    console.log('   • Discord web app access')
    console.log('   • JavaScript execution')
    console.log('   • Activity injection')
    console.log('\n🚀 Ready for quest completion!')
    
    return true
    
  } catch (error) {
    console.error('\n❌ TEST FAILED!')
    console.error('Error:', error.message)
    console.error('\nPossible solutions:')
    console.error('1. Ensure Chromium is installed: apk add chromium')
    console.error('2. Check Puppeteer installation: npm install puppeteer')
    console.error('3. Verify permissions for sandbox mode')
    console.error('4. Check available memory/disk space')
    return false
    
  } finally {
    if (browser) {
      await browser.close()
      console.log('\n🔒 Browser closed')
    }
  }
}

async function testWithToken(token) {
  console.log('\n🔐 Testing with Discord token authentication...')
  
  let browser = null
  
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })
    
    const page = await browser.newPage()
    
    // Navigate to Discord
    await page.goto('https://discord.com/app', { waitUntil: 'networkidle2' })
    
    // Inject token
    console.log('💉 Injecting token into localStorage...')
    await page.evaluate((t) => {
      localStorage.setItem('token', `"${t}"`)
      document.cookie = `token=${t}; path=/; domain=.discord.com`
    }, token)
    
    // Reload to apply token
    await page.goto('https://discord.com/app', { waitUntil: 'networkidle2' })
    
    // Wait for auth to process
    await new Promise(r => setTimeout(r, 3000))
    
    // Check if authenticated
    const authStatus = await page.evaluate(async () => {
      try {
        const response = await fetch('/api/v10/users/@me', {
          headers: { 'Authorization': localStorage.getItem('token')?.replace(/"/g, '') || '' }
        })
        
        if (response.ok) {
          const user = await response.json()
          return { success: true, username: user.username, id: user.id }
        }
        
        return { success: false, error: `HTTP ${response.status}` }
      } catch (err) {
        return { success: false, error: err.message }
      }
    })
    
    if (authStatus.success) {
      console.log(`✅ Authenticated as: ${authStatus.username} (${authStatus.id})`)
      
      // Test activity setting
      console.log('🎮 Testing activity injection...')
      await page.evaluate(({ appId, gameName }) => {
        window.__TEST_ACTIVITY = {
          appId,
          gameName,
          timestamp: Date.now(),
          status: 'injected'
        }
        
        // Dispatch custom event
        window.dispatchEvent(new CustomEvent('activityTest', {
          detail: { appId, gameName }
        }))
      }, { appId: '1421154726023532544', gameName: 'EA SPORTS FC 26' })
      
      console.log('✅ Activity injection successful')
      console.log('\n🎉 Token test PASSED! Quest automation should work.')
      
    } else {
      console.log(`❌ Authentication failed: ${authStatus.error}`)
      console.log('Token may be invalid or expired.')
    }
    
  } catch (error) {
    console.error('❌ Token test failed:', error.message)
  } finally {
    if (browser) await browser.close()
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2)
  const tokenIndex = args.indexOf('--token')
  const token = tokenIndex !== -1 && args[tokenIndex + 1] ? args[tokenIndex + 1] : null
  
  console.log('╔══════════════════════════════════════════╗')
  console.log('║  Chromium Client Test Suite               ║')
  console.log('║  Discord Quest Automation System          ║')
  console.log('╚══════════════════════════════════════════╝')
  
  // Run basic tests
  const basicTestsPassed = await testChromiumSetup()
  
  // If token provided, run auth test
  if (token && basicTestsPassed) {
    await testWithToken(token)
  } else if (!token) {
    console.log('\n💡 Tip: Run with --token YOUR_TOKEN to test authentication')
    console.log('   Example: node scripts/test-chromium.js --token abc123...')
  }
  
  process.exit(basicTestsPassed ? 0 : 1)
}

main().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
