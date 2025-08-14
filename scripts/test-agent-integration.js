#!/usr/bin/env node

/**
 * Agent Integration Test Runner
 * 
 * This script runs comprehensive tests for the Agent integration implementation
 * and generates a detailed test report.
 */

const path = require('path');
const fs = require('fs');

console.log('🤖 Rabby Agent Integration Test Suite');
console.log('=====================================\n');

// Test configuration
const testConfig = {
  rootDir: path.resolve(__dirname, '..'),
  testFiles: [
    '__tests__/agent-integration.test.js'
  ],
  timeout: 30000,
  verbose: true
};

// Manual test execution (since we're not running full Jest)
async function runTests() {
  console.log('📋 Running Agent Integration Tests...\n');
  
  const results = {
    passed: 0,
    failed: 0,
    total: 0,
    details: []
  };

  // Test 1: Build System Validation
  console.log('1️⃣  Build System Testing');
  console.log('────────────────────────');
  
  try {
    // Check webpack configuration
    const webpackConfigPath = path.join(testConfig.rootDir, 'build/webpack.common.config.js');
    if (fs.existsSync(webpackConfigPath)) {
      const webpackConfig = require(webpackConfigPath);
      
      // Test agent-sidebar entry
      if (webpackConfig.entry && webpackConfig.entry['agent-sidebar']) {
        console.log('✅ Webpack agent-sidebar entry point configured');
        results.passed++;
      } else {
        console.log('❌ Webpack agent-sidebar entry point missing');
        results.failed++;
      }
      
      // Test HTML plugin for agent-sidebar
      const htmlPlugins = webpackConfig.plugins?.filter(plugin => 
        plugin.constructor.name === 'HtmlWebpackPlugin' || 
        (plugin.options && plugin.options.filename)
      ) || [];
      
      const agentHtmlPlugin = htmlPlugins.find(plugin => 
        plugin.options?.filename === 'agent-sidebar.html'
      );
      
      if (agentHtmlPlugin) {
        console.log('✅ Agent sidebar HTML plugin configured');
        results.passed++;
      } else {
        console.log('❌ Agent sidebar HTML plugin missing');
        results.failed++;
      }
      
      // Test React compatibility alias
      if (webpackConfig.resolve?.alias?.['react-dom/client']) {
        console.log('✅ React compatibility layer configured');
        results.passed++;
      } else {
        console.log('❌ React compatibility layer missing');
        results.failed++;
      }
      
    } else {
      console.log('❌ Webpack configuration file not found');
      results.failed += 3;
    }
    
    results.total += 3;
    
  } catch (error) {
    console.log('❌ Build system test failed:', error.message);
    results.failed += 3;
    results.total += 3;
  }

  console.log('');

  // Test 2: Manifest Configuration
  console.log('2️⃣  Manifest Configuration Testing');
  console.log('─────────────────────────────────');
  
  try {
    const manifestPath = path.join(testConfig.rootDir, 'src/manifest/chrome-mv3/manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      
      // Check sidePanel permission
      if (manifest.permissions?.includes('sidePanel')) {
        console.log('✅ sidePanel permission configured');
        results.passed++;
      } else {
        console.log('❌ sidePanel permission missing');
        results.failed++;
      }
      
      // Check debugger permission
      if (manifest.permissions?.includes('debugger')) {
        console.log('✅ debugger permission configured');
        results.passed++;
      } else {
        console.log('❌ debugger permission missing');
        results.failed++;
      }
      
      // Check CSP
      if (manifest.content_security_policy?.extension_pages) {
        console.log('✅ Content Security Policy configured');
        results.passed++;
      } else {
        console.log('❌ Content Security Policy missing');
        results.failed++;
      }
      
    } else {
      console.log('❌ Manifest file not found');
      results.failed += 3;
    }
    
    results.total += 3;
    
  } catch (error) {
    console.log('❌ Manifest test failed:', error.message);
    results.failed += 3;
    results.total += 3;
  }

  console.log('');

  // Test 3: File Structure Validation
  console.log('3️⃣  File Structure Testing');
  console.log('─────────────────────────');
  
  const requiredFiles = [
    'src/ui/views/Agent/index.tsx',
    'src/ui/views/Agent/SidePanelApp.tsx',
    'src/ui/views/Agent/index.html',
    'src/ui/assets/dashboard/agent-star.svg',
    'src/background/service/agent.ts',
    'src/background/service/agent/storage.ts',
    'src/background/service/agent/chatHistory.ts',
    'src/ui/utils/react-compat.ts'
  ];
  
  requiredFiles.forEach(file => {
    const filePath = path.join(testConfig.rootDir, file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ ${file} exists`);
      results.passed++;
    } else {
      console.log(`❌ ${file} missing`);
      results.failed++;
    }
    results.total++;
  });

  console.log('');

  // Test 4: UI Integration Validation
  console.log('4️⃣  UI Integration Testing');
  console.log('────────────────────────');
  
  try {
    // Check ChainAndSiteSelector integration
    const selectorPath = path.join(testConfig.rootDir, 'src/ui/views/Dashboard/components/ChainAndSiteSelector/index.tsx');
    if (fs.existsSync(selectorPath)) {
      const selectorContent = fs.readFileSync(selectorPath, 'utf8');
      
      // Check for Agent icon import
      if (selectorContent.includes('RcIconAgentStar')) {
        console.log('✅ Agent icon imported in dashboard');
        results.passed++;
      } else {
        console.log('❌ Agent icon not imported in dashboard');
        results.failed++;
      }
      
      // Check for agent panel item
      if (selectorContent.includes('agent:') && selectorContent.includes('sidePanel.open')) {
        console.log('✅ Agent panel item configured with sidePanel.open');
        results.passed++;
      } else {
        console.log('❌ Agent panel item not properly configured');
        results.failed++;
      }
      
    } else {
      console.log('❌ ChainAndSiteSelector component not found');
      results.failed += 2;
    }
    
    results.total += 2;
    
  } catch (error) {
    console.log('❌ UI integration test failed:', error.message);
    results.failed += 2;
    results.total += 2;
  }

  console.log('');

  // Test 5: Component Import Validation
  console.log('5️⃣  Component Import Testing');
  console.log('───────────────────────────');
  
  const componentFiles = [
    'src/ui/views/Agent/components/ChatInput.tsx',
    'src/ui/views/Agent/components/MessageList.tsx',
    'src/ui/views/Agent/components/ChatHistoryList.tsx',
    'src/ui/views/Agent/components/BookmarkList.tsx'
  ];
  
  componentFiles.forEach(file => {
    const filePath = path.join(testConfig.rootDir, file);
    if (fs.existsSync(filePath)) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        // Basic syntax validation - check for export
        if (content.includes('export') && (content.includes('function') || content.includes('const'))) {
          console.log(`✅ ${path.basename(file)} component structure valid`);
          results.passed++;
        } else {
          console.log(`❌ ${path.basename(file)} component structure invalid`);
          results.failed++;
        }
      } catch (error) {
        console.log(`❌ ${path.basename(file)} failed to read:`, error.message);
        results.failed++;
      }
    } else {
      console.log(`❌ ${path.basename(file)} missing`);
      results.failed++;
    }
    results.total++;
  });

  console.log('');

  // Test 6: Storage Integration
  console.log('6️⃣  Storage Integration Testing');
  console.log('──────────────────────────────');
  
  try {
    const storagePath = path.join(testConfig.rootDir, 'src/background/service/agent/storage.ts');
    if (fs.existsSync(storagePath)) {
      const storageContent = fs.readFileSync(storagePath, 'utf8');
      
      // Check for proper namespacing
      if (storageContent.includes('rabby-agent-')) {
        console.log('✅ Storage namespacing implemented');
        results.passed++;
      } else {
        console.log('❌ Storage namespacing missing');
        results.failed++;
      }
      
      // Check for createAgentStorage function
      if (storageContent.includes('createAgentStorage')) {
        console.log('✅ Agent storage factory function exists');
        results.passed++;
      } else {
        console.log('❌ Agent storage factory function missing');
        results.failed++;
      }
      
    } else {
      console.log('❌ Storage integration file not found');
      results.failed += 2;
    }
    
    results.total += 2;
    
  } catch (error) {
    console.log('❌ Storage integration test failed:', error.message);
    results.failed += 2;
    results.total += 2;
  }

  console.log('');

  // Test 7: Localization
  console.log('7️⃣  Localization Testing');
  console.log('───────────────────────');
  
  try {
    const localesPath = path.join(testConfig.rootDir, '_raw/_locales/en/messages.json');
    if (fs.existsSync(localesPath)) {
      const messages = JSON.parse(fs.readFileSync(localesPath, 'utf8'));
      
      if (messages.page_dashboard_home_panel_agent) {
        console.log('✅ Agent localization entry exists');
        results.passed++;
      } else {
        console.log('❌ Agent localization entry missing');
        results.failed++;
      }
      
    } else {
      console.log('❌ Localization file not found');
      results.failed++;
    }
    
    results.total++;
    
  } catch (error) {
    console.log('❌ Localization test failed:', error.message);
    results.failed++;
    results.total++;
  }

  console.log('');

  // Test 8: Service Integration
  console.log('8️⃣  Service Integration Testing');
  console.log('──────────────────────────────');
  
  try {
    const servicesPath = path.join(testConfig.rootDir, 'src/background/service/index.ts');
    if (fs.existsSync(servicesPath)) {
      const servicesContent = fs.readFileSync(servicesPath, 'utf8');
      
      if (servicesContent.includes('agentService')) {
        console.log('✅ Agent service exported from service index');
        results.passed++;
      } else {
        console.log('❌ Agent service not exported from service index');
        results.failed++;
      }
      
    } else {
      console.log('❌ Service index file not found');
      results.failed++;
    }
    
    results.total++;
    
  } catch (error) {
    console.log('❌ Service integration test failed:', error.message);
    results.failed++;
    results.total++;
  }

  console.log('');

  // Print summary
  console.log('📊 Test Results Summary');
  console.log('════════════════════════');
  console.log(`Total Tests: ${results.total}`);
  console.log(`Passed: ${results.passed} ✅`);
  console.log(`Failed: ${results.failed} ❌`);
  console.log(`Success Rate: ${((results.passed / results.total) * 100).toFixed(1)}%`);
  
  if (results.failed === 0) {
    console.log('\n🎉 All tests passed! Agent integration is ready.');
  } else {
    console.log(`\n⚠️  ${results.failed} test(s) failed. Please review the issues above.`);
  }
  
  console.log('\n📝 Next Steps:');
  console.log('1. Run: yarn build:dev to test build process');
  console.log('2. Load extension in Chrome to test functionality');
  console.log('3. Test Agent sidebar opening from dashboard');
  console.log('4. Test message sending and agent responses');
  console.log('5. Verify storage isolation and chat history');
  
  return results;
}

// Build validation tests
async function testBuild() {
  console.log('\n🔨 Testing Build Process');
  console.log('─────────────────────────');
  
  const { spawn } = require('child_process');
  const buildProcess = spawn('yarn', ['build:dev'], { 
    cwd: testConfig.rootDir,
    stdio: 'pipe'
  });
  
  return new Promise((resolve) => {
    let output = '';
    let error = '';
    
    buildProcess.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    buildProcess.stderr.on('data', (data) => {
      error += data.toString();
    });
    
    buildProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Build process completed successfully');
        
        // Check if agent-sidebar.js was created
        const distPath = path.join(testConfig.rootDir, 'dist', 'agent-sidebar.js');
        if (fs.existsSync(distPath)) {
          console.log('✅ agent-sidebar.js bundle created');
        } else {
          console.log('❌ agent-sidebar.js bundle missing');
        }
        
        // Check if agent-sidebar.html was created
        const htmlPath = path.join(testConfig.rootDir, 'dist', 'agent-sidebar.html');
        if (fs.existsSync(htmlPath)) {
          console.log('✅ agent-sidebar.html created');
        } else {
          console.log('❌ agent-sidebar.html missing');
        }
        
      } else {
        console.log('❌ Build process failed with code:', code);
        if (error) {
          console.log('Error output:', error);
        }
      }
      
      resolve(code === 0);
    });
    
    // Timeout after 60 seconds
    setTimeout(() => {
      buildProcess.kill();
      console.log('❌ Build process timed out');
      resolve(false);
    }, 60000);
  });
}

// Main execution
async function main() {
  const testResults = await runTests();
  
  if (process.argv.includes('--build')) {
    await testBuild();
  }
  
  process.exit(testResults.failed > 0 ? 1 : 0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { runTests, testBuild };