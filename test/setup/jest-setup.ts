/**
 * Jest global setup
 * Checks if required services are running before tests start
 */

export default async function globalSetup() {
  console.log('\n🔍 Checking if services are running...\n');

  const requiredServices = [
    { name: 'Anvil Chain', url: 'http://localhost:8545', method: 'POST', body: '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' },
    { name: 'Orderbook API', url: 'http://localhost:8080/api/v1/version', method: 'GET' },
  ];

  for (const service of requiredServices) {
    try {
      const response = await fetch(service.url, {
        method: service.method,
        headers: service.body ? { 'Content-Type': 'application/json' } : {},
        body: service.body,
      });

      if (response.ok) {
        console.log(`✅ ${service.name} is running`);
      } else {
        throw new Error(`Service returned status ${response.status}`);
      }
    } catch (error) {
      console.error(`\n❌ ${service.name} is not running!`);
      console.error(`   URL: ${service.url}`);
      console.error(`   Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.error('\n⚠️  Please start the services first:');
      console.error('   docker-compose up -d\n');
      process.exit(1);
    }
  }

  console.log('\n✅ All required services are running!\n');
}
