import assert from 'node:assert';

const APP_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxanKwIuGMmw15-sipt57hB8A8B5f73CNEhwAgau5Aweg_Hhw1OBkF7WwDMGlvP3RQXrA/exec';

async function testAppScriptApi() {
  console.log('🧪 Testing Google Apps Script Endpoint:');
  console.log(`🔗 Target URL: ${APP_SCRIPT_URL}\n`);

  // Case 1: getPosts action
  console.log('▶ Case 1: GET ?action=getPosts');
  const t0 = Date.now();
  const res1 = await fetch(`${APP_SCRIPT_URL}?action=getPosts`, { redirect: 'follow' });
  const latency1 = Date.now() - t0;
  
  assert.strictEqual(res1.status, 200, `Expected 200, got ${res1.status}`);
  const json1 = await res1.json();
  console.log(`   ✅ Status: ${res1.status} OK (${latency1}ms)`);
  console.log(`   ✅ Response:`, JSON.stringify(json1));
  assert.ok(Array.isArray(json1.posts), 'Response should have a "posts" array');
  console.log(`   ✅ Posts count: ${json1.posts.length}`);

  // Case 2: Unknown action fallback
  console.log('\n▶ Case 2: GET without action (Fallback / Error Handling)');
  const t1 = Date.now();
  const res2 = await fetch(APP_SCRIPT_URL, { redirect: 'follow' });
  const latency2 = Date.now() - t1;

  assert.strictEqual(res2.status, 200, `Expected 200, got ${res2.status}`);
  const json2 = await res2.json();
  console.log(`   ✅ Status: ${res2.status} OK (${latency2}ms)`);
  console.log(`   ✅ Response:`, JSON.stringify(json2));
  assert.strictEqual(json2.success, false, 'Expected success: false');
  assert.strictEqual(json2.error, 'unknown action', 'Expected error: unknown action');

  console.log('\n🎉 ALL TESTS PASSED! The Google Apps Script API endpoint is STILL LIVE and fully operational.');
}

testAppScriptApi().catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
